"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItemsService = void 0;
const lodash_1 = require("lodash");
const cache_1 = require("../cache");
const database_1 = __importDefault(require("../database"));
const run_ast_1 = __importDefault(require("../database/run-ast"));
const emitter_1 = __importDefault(require("../emitter"));
const env_1 = __importDefault(require("../env"));
const exceptions_1 = require("../exceptions");
const translate_1 = require("../exceptions/database/translate");
const types_1 = require("../types");
const get_ast_from_query_1 = __importDefault(require("../utils/get-ast-from-query"));
const authorization_1 = require("./authorization");
const payload_1 = require("./payload");
const index_1 = require("./index");
class ItemsService {
    constructor(collection, options) {
        this.collection = collection;
        this.knex = options.knex || (0, database_1.default)();
        this.accountability = options.accountability || null;
        this.eventScope = this.collection.startsWith('directus_') ? this.collection.substring(9) : 'items';
        this.schema = options.schema;
        this.cache = (0, cache_1.getCache)().cache;
        return this;
    }
    async getKeysByQuery(query) {
        const primaryKeyField = this.schema.collections[this.collection].primary;
        const readQuery = (0, lodash_1.cloneDeep)(query);
        readQuery.fields = [primaryKeyField];
        // Allow unauthenticated access
        const itemsService = new ItemsService(this.collection, {
            knex: this.knex,
            schema: this.schema,
        });
        // We read the IDs of the items based on the query, and then run `updateMany`. `updateMany` does it's own
        // permissions check for the keys, so we don't have to make this an authenticated read
        const items = await itemsService.readByQuery(readQuery);
        return items.map((item) => item[primaryKeyField]).filter((pk) => pk);
    }
    /**
     * Create a single new item.
     */
    async createOne(data, opts) {
        const primaryKeyField = this.schema.collections[this.collection].primary;
        const fields = Object.keys(this.schema.collections[this.collection].fields);
        const aliases = Object.values(this.schema.collections[this.collection].fields)
            .filter((field) => field.alias === true)
            .map((field) => field.field);
        const payload = (0, lodash_1.cloneDeep)(data);
        // By wrapping the logic in a transaction, we make sure we automatically roll back all the
        // changes in the DB if any of the parts contained within throws an error. This also means
        // that any errors thrown in any nested relational changes will bubble up and cancel the whole
        // update tree
        const primaryKey = await this.knex.transaction(async (trx) => {
            // We're creating new services instances so they can use the transaction as their Knex interface
            const payloadService = new payload_1.PayloadService(this.collection, {
                accountability: this.accountability,
                knex: trx,
                schema: this.schema,
            });
            const authorizationService = new authorization_1.AuthorizationService({
                accountability: this.accountability,
                knex: trx,
                schema: this.schema,
            });
            // Run all hooks that are attached to this event so the end user has the chance to augment the
            // item that is about to be saved
            const payloadAfterHooks = (opts === null || opts === void 0 ? void 0 : opts.emitEvents) !== false
                ? await emitter_1.default.emitFilter(this.eventScope === 'items'
                    ? ['items.create', `${this.collection}.items.create`]
                    : `${this.eventScope}.create`, payload, {
                    collection: this.collection,
                }, {
                    database: trx,
                    schema: this.schema,
                    accountability: this.accountability,
                })
                : payload;
            const payloadWithPresets = this.accountability
                ? await authorizationService.validatePayload('create', this.collection, payloadAfterHooks)
                : payloadAfterHooks;
            const { payload: payloadWithM2O, revisions: revisionsM2O } = await payloadService.processM2O(payloadWithPresets);
            const { payload: payloadWithA2O, revisions: revisionsA2O } = await payloadService.processA2O(payloadWithM2O);
            const payloadWithoutAliases = (0, lodash_1.pick)(payloadWithA2O, (0, lodash_1.without)(fields, ...aliases));
            const payloadWithTypeCasting = await payloadService.processValues('create', payloadWithoutAliases);
            // In case of manual string / UUID primary keys, the PK already exists in the object we're saving.
            let primaryKey = payloadWithTypeCasting[primaryKeyField];
            try {
                const result = await trx.insert(payloadWithoutAliases).into(this.collection).returning(primaryKeyField);
                primaryKey = primaryKey !== null && primaryKey !== void 0 ? primaryKey : result[0];
            }
            catch (err) {
                throw await (0, translate_1.translateDatabaseError)(err);
            }
            // Most database support returning, those who don't tend to return the PK anyways
            // (MySQL/SQLite). In case the primary key isn't know yet, we'll do a best-attempt at
            // fetching it based on the last inserted row
            if (!primaryKey) {
                // Fetching it with max should be safe, as we're in the context of the current transaction
                const result = await trx.max(primaryKeyField, { as: 'id' }).from(this.collection).first();
                primaryKey = result.id;
                // Set the primary key on the input item, in order for the "after" event hook to be able
                // to read from it
                payload[primaryKeyField] = primaryKey;
            }
            const { revisions: revisionsO2M } = await payloadService.processO2M(payload, primaryKey);
            // If this is an authenticated action, and accountability tracking is enabled, save activity row
            if (this.accountability && this.schema.collections[this.collection].accountability !== null) {
                const activityService = new index_1.ActivityService({
                    knex: trx,
                    schema: this.schema,
                });
                const activity = await activityService.createOne({
                    action: types_1.Action.CREATE,
                    user: this.accountability.user,
                    collection: this.collection,
                    ip: this.accountability.ip,
                    user_agent: this.accountability.userAgent,
                    item: primaryKey,
                });
                // If revisions are tracked, create revisions record
                if (this.schema.collections[this.collection].accountability === 'all') {
                    const revisionsService = new index_1.RevisionsService({
                        knex: trx,
                        schema: this.schema,
                    });
                    const revision = await revisionsService.createOne({
                        activity: activity,
                        collection: this.collection,
                        item: primaryKey,
                        data: await payloadService.prepareDelta(payload),
                        delta: await payloadService.prepareDelta(payload),
                    });
                    // Make sure to set the parent field of the child-revision rows
                    const childrenRevisions = [...revisionsM2O, ...revisionsA2O, ...revisionsO2M];
                    if (childrenRevisions.length > 0) {
                        await revisionsService.updateMany(childrenRevisions, { parent: revision });
                    }
                    if (opts === null || opts === void 0 ? void 0 : opts.onRevisionCreate) {
                        opts.onRevisionCreate(revision);
                    }
                }
            }
            return primaryKey;
        });
        if ((opts === null || opts === void 0 ? void 0 : opts.emitEvents) !== false) {
            emitter_1.default.emitAction(this.eventScope === 'items' ? ['items.create', `${this.collection}.items.create`] : `${this.eventScope}.create`, {
                payload,
                key: primaryKey,
                collection: this.collection,
            }, {
                // This hook is called async. If we would pass the transaction here, the hook can be
                // called after the transaction is done #5460
                database: this.knex || (0, database_1.default)(),
                schema: this.schema,
                accountability: this.accountability,
            });
        }
        if (this.cache && env_1.default.CACHE_AUTO_PURGE && (opts === null || opts === void 0 ? void 0 : opts.autoPurgeCache) !== false) {
            await this.cache.clear();
        }
        return primaryKey;
    }
    /**
     * Create multiple new items at once. Inserts all provided records sequentially wrapped in a transaction.
     */
    async createMany(data, opts) {
        const primaryKeys = await this.knex.transaction(async (trx) => {
            const service = new ItemsService(this.collection, {
                accountability: this.accountability,
                schema: this.schema,
                knex: trx,
            });
            const primaryKeys = [];
            for (const payload of data) {
                const primaryKey = await service.createOne(payload, { ...(opts || {}), autoPurgeCache: false });
                primaryKeys.push(primaryKey);
            }
            return primaryKeys;
        });
        if (this.cache && env_1.default.CACHE_AUTO_PURGE && (opts === null || opts === void 0 ? void 0 : opts.autoPurgeCache) !== false) {
            await this.cache.clear();
        }
        return primaryKeys;
    }
    /**
     * Get items by query
     */
    async readByQuery(query, opts) {
        let ast = await (0, get_ast_from_query_1.default)(this.collection, query, this.schema, {
            accountability: this.accountability,
            // By setting the permissions action, you can read items using the permissions for another
            // operation's permissions. This is used to dynamically check if you have update/delete
            // access to (a) certain item(s)
            action: (opts === null || opts === void 0 ? void 0 : opts.permissionsAction) || 'read',
            knex: this.knex,
        });
        if (this.accountability && this.accountability.admin !== true) {
            const authorizationService = new authorization_1.AuthorizationService({
                accountability: this.accountability,
                knex: this.knex,
                schema: this.schema,
            });
            ast = await authorizationService.processAST(ast, opts === null || opts === void 0 ? void 0 : opts.permissionsAction);
        }
        const records = await (0, run_ast_1.default)(ast, this.schema, {
            knex: this.knex,
            // GraphQL requires relational keys to be returned regardless
            stripNonRequested: (opts === null || opts === void 0 ? void 0 : opts.stripNonRequested) !== undefined ? opts.stripNonRequested : true,
        });
        if (records === null) {
            throw new exceptions_1.ForbiddenException();
        }
        const filteredRecords = await emitter_1.default.emitFilter(this.eventScope === 'items' ? ['items.read', `${this.collection}.items.read`] : `${this.eventScope}.read`, records, {
            query,
            collection: this.collection,
        }, {
            database: this.knex,
            schema: this.schema,
            accountability: this.accountability,
        });
        emitter_1.default.emitAction(this.eventScope === 'items' ? ['items.read', `${this.collection}.items.read`] : `${this.eventScope}.read`, {
            payload: filteredRecords,
            query,
            collection: this.collection,
        }, {
            database: this.knex || (0, database_1.default)(),
            schema: this.schema,
            accountability: this.accountability,
        });
        return filteredRecords;
    }
    /**
     * Get single item by primary key
     */
    async readOne(key, query = {}, opts) {
        const primaryKeyField = this.schema.collections[this.collection].primary;
        const filterWithKey = (0, lodash_1.assign)({}, query.filter, { [primaryKeyField]: { _eq: key } });
        const queryWithKey = (0, lodash_1.assign)({}, query, { filter: filterWithKey });
        const results = await this.readByQuery(queryWithKey, opts);
        if (results.length === 0) {
            throw new exceptions_1.ForbiddenException();
        }
        return results[0];
    }
    /**
     * Get multiple items by primary keys
     */
    async readMany(keys, query = {}, opts) {
        var _a;
        const primaryKeyField = this.schema.collections[this.collection].primary;
        const filterWithKey = { _and: [{ [primaryKeyField]: { _in: keys } }, (_a = query.filter) !== null && _a !== void 0 ? _a : {}] };
        const queryWithKey = (0, lodash_1.assign)({}, query, { filter: filterWithKey });
        const results = await this.readByQuery(queryWithKey, opts);
        return results;
    }
    /**
     * Update multiple items by query
     */
    async updateByQuery(query, data, opts) {
        const keys = await this.getKeysByQuery(query);
        return keys.length ? await this.updateMany(keys, data, opts) : [];
    }
    /**
     * Update a single item by primary key
     */
    async updateOne(key, data, opts) {
        await this.updateMany([key], data, opts);
        return key;
    }
    /**
     * Update many items by primary key
     */
    async updateMany(keys, data, opts) {
        const primaryKeyField = this.schema.collections[this.collection].primary;
        const fields = Object.keys(this.schema.collections[this.collection].fields);
        const aliases = Object.values(this.schema.collections[this.collection].fields)
            .filter((field) => field.alias === true)
            .map((field) => field.field);
        const payload = (0, lodash_1.cloneDeep)(data);
        const authorizationService = new authorization_1.AuthorizationService({
            accountability: this.accountability,
            knex: this.knex,
            schema: this.schema,
        });
        // Run all hooks that are attached to this event so the end user has the chance to augment the
        // item that is about to be saved
        const payloadAfterHooks = (opts === null || opts === void 0 ? void 0 : opts.emitEvents) !== false
            ? await emitter_1.default.emitFilter(this.eventScope === 'items'
                ? ['items.update', `${this.collection}.items.update`]
                : `${this.eventScope}.update`, payload, {
                keys,
                collection: this.collection,
            }, {
                database: this.knex,
                schema: this.schema,
                accountability: this.accountability,
            })
            : payload;
        if (this.accountability) {
            await authorizationService.checkAccess('update', this.collection, keys);
        }
        const payloadWithPresets = this.accountability
            ? await authorizationService.validatePayload('update', this.collection, payloadAfterHooks)
            : payloadAfterHooks;
        await this.knex.transaction(async (trx) => {
            const payloadService = new payload_1.PayloadService(this.collection, {
                accountability: this.accountability,
                knex: trx,
                schema: this.schema,
            });
            const { payload: payloadWithM2O, revisions: revisionsM2O } = await payloadService.processM2O(payloadWithPresets);
            const { payload: payloadWithA2O, revisions: revisionsA2O } = await payloadService.processA2O(payloadWithM2O);
            const payloadWithoutAliasAndPK = (0, lodash_1.pick)(payloadWithA2O, (0, lodash_1.without)(fields, primaryKeyField, ...aliases));
            const payloadWithTypeCasting = await payloadService.processValues('update', payloadWithoutAliasAndPK);
            if (Object.keys(payloadWithTypeCasting).length > 0) {
                try {
                    await trx(this.collection).update(payloadWithTypeCasting).whereIn(primaryKeyField, keys);
                }
                catch (err) {
                    throw await (0, translate_1.translateDatabaseError)(err);
                }
            }
            const childrenRevisions = [...revisionsM2O, ...revisionsA2O];
            for (const key of keys) {
                const { revisions } = await payloadService.processO2M(payload, key);
                childrenRevisions.push(...revisions);
            }
            // If this is an authenticated action, and accountability tracking is enabled, save activity row
            if (this.accountability && this.schema.collections[this.collection].accountability !== null) {
                const activityService = new index_1.ActivityService({
                    knex: trx,
                    schema: this.schema,
                });
                const activity = await activityService.createMany(keys.map((key) => ({
                    action: types_1.Action.UPDATE,
                    user: this.accountability.user,
                    collection: this.collection,
                    ip: this.accountability.ip,
                    user_agent: this.accountability.userAgent,
                    item: key,
                })));
                if (this.schema.collections[this.collection].accountability === 'all') {
                    const itemsService = new ItemsService(this.collection, {
                        knex: trx,
                        schema: this.schema,
                    });
                    const snapshots = await itemsService.readMany(keys);
                    const revisionsService = new index_1.RevisionsService({
                        knex: trx,
                        schema: this.schema,
                    });
                    const revisionIDs = await revisionsService.createMany(await Promise.all(activity.map(async (activity, index) => ({
                        activity: activity,
                        collection: this.collection,
                        item: keys[index],
                        data: snapshots && Array.isArray(snapshots) ? JSON.stringify(snapshots[index]) : JSON.stringify(snapshots),
                        delta: await payloadService.prepareDelta(payloadWithTypeCasting),
                    }))));
                    for (let i = 0; i < revisionIDs.length; i++) {
                        const revisionID = revisionIDs[i];
                        if (opts === null || opts === void 0 ? void 0 : opts.onRevisionCreate) {
                            opts.onRevisionCreate(revisionID);
                        }
                        if (i === 0) {
                            // In case of a nested relational creation/update in a updateMany, the nested m2o/a2o
                            // creation is only done once. We treat the first updated item as the "main" update,
                            // with all other revisions on the current level as regular "flat" updates, and
                            // nested revisions as children of this first "root" item.
                            if (childrenRevisions.length > 0) {
                                await revisionsService.updateMany(childrenRevisions, { parent: revisionID });
                            }
                        }
                    }
                }
            }
        });
        if (this.cache && env_1.default.CACHE_AUTO_PURGE && (opts === null || opts === void 0 ? void 0 : opts.autoPurgeCache) !== false) {
            await this.cache.clear();
        }
        if ((opts === null || opts === void 0 ? void 0 : opts.emitEvents) !== false) {
            emitter_1.default.emitAction(this.eventScope === 'items' ? ['items.update', `${this.collection}.items.update`] : `${this.eventScope}.update`, {
                payload,
                keys,
                collection: this.collection,
            }, {
                // This hook is called async. If we would pass the transaction here, the hook can be
                // called after the transaction is done #5460
                database: this.knex || (0, database_1.default)(),
                schema: this.schema,
                accountability: this.accountability,
            });
        }
        return keys;
    }
    /**
     * Upsert a single item
     */
    async upsertOne(payload, opts) {
        const primaryKeyField = this.schema.collections[this.collection].primary;
        const primaryKey = payload[primaryKeyField];
        const exists = primaryKey &&
            !!(await this.knex
                .select(primaryKeyField)
                .from(this.collection)
                .where({ [primaryKeyField]: primaryKey })
                .first());
        if (exists) {
            return await this.updateOne(primaryKey, payload, opts);
        }
        else {
            return await this.createOne(payload, opts);
        }
    }
    /**
     * Upsert many items
     */
    async upsertMany(payloads, opts) {
        const primaryKeys = await this.knex.transaction(async (trx) => {
            const service = new ItemsService(this.collection, {
                accountability: this.accountability,
                schema: this.schema,
                knex: trx,
            });
            const primaryKeys = [];
            for (const payload of payloads) {
                const primaryKey = await service.upsertOne(payload, { ...(opts || {}), autoPurgeCache: false });
                primaryKeys.push(primaryKey);
            }
            return primaryKeys;
        });
        if (this.cache && env_1.default.CACHE_AUTO_PURGE && (opts === null || opts === void 0 ? void 0 : opts.autoPurgeCache) !== false) {
            await this.cache.clear();
        }
        return primaryKeys;
    }
    /**
     * Delete multiple items by query
     */
    async deleteByQuery(query, opts) {
        const keys = await this.getKeysByQuery(query);
        return keys.length ? await this.deleteMany(keys, opts) : [];
    }
    /**
     * Delete a single item by primary key
     */
    async deleteOne(key, opts) {
        await this.deleteMany([key], opts);
        return key;
    }
    /**
     * Delete multiple items by primary key
     */
    async deleteMany(keys, opts) {
        const primaryKeyField = this.schema.collections[this.collection].primary;
        if (this.accountability && this.accountability.admin !== true) {
            const authorizationService = new authorization_1.AuthorizationService({
                accountability: this.accountability,
                schema: this.schema,
            });
            await authorizationService.checkAccess('delete', this.collection, keys);
        }
        if ((opts === null || opts === void 0 ? void 0 : opts.emitEvents) !== false) {
            await emitter_1.default.emitFilter(this.eventScope === 'items' ? ['items.delete', `${this.collection}.items.delete`] : `${this.eventScope}.delete`, keys, {
                collection: this.collection,
            }, {
                database: this.knex,
                schema: this.schema,
                accountability: this.accountability,
            });
        }
        await this.knex.transaction(async (trx) => {
            await trx(this.collection).whereIn(primaryKeyField, keys).delete();
            if (this.accountability && this.schema.collections[this.collection].accountability !== null) {
                const activityService = new index_1.ActivityService({
                    knex: trx,
                    schema: this.schema,
                });
                await activityService.createMany(keys.map((key) => ({
                    action: types_1.Action.DELETE,
                    user: this.accountability.user,
                    collection: this.collection,
                    ip: this.accountability.ip,
                    user_agent: this.accountability.userAgent,
                    item: key,
                })));
            }
        });
        if (this.cache && env_1.default.CACHE_AUTO_PURGE && (opts === null || opts === void 0 ? void 0 : opts.autoPurgeCache) !== false) {
            await this.cache.clear();
        }
        if ((opts === null || opts === void 0 ? void 0 : opts.emitEvents) !== false) {
            emitter_1.default.emitAction(this.eventScope === 'items' ? ['items.delete', `${this.collection}.items.delete`] : `${this.eventScope}.delete`, {
                payload: keys,
                collection: this.collection,
            }, {
                // This hook is called async. If we would pass the transaction here, the hook can be
                // called after the transaction is done #5460
                database: this.knex || (0, database_1.default)(),
                schema: this.schema,
                accountability: this.accountability,
            });
        }
        return keys;
    }
    /**
     * Read/treat collection as singleton
     */
    async readSingleton(query, opts) {
        query = (0, lodash_1.clone)(query);
        query.limit = 1;
        const records = await this.readByQuery(query, opts);
        const record = records[0];
        if (!record) {
            let fields = Object.entries(this.schema.collections[this.collection].fields);
            const defaults = {};
            if (query.fields && query.fields.includes('*') === false) {
                fields = fields.filter(([name]) => {
                    return query.fields.includes(name);
                });
            }
            for (const [name, field] of fields) {
                if (this.schema.collections[this.collection].primary === name) {
                    defaults[name] = null;
                    continue;
                }
                defaults[name] = field.defaultValue;
            }
            return defaults;
        }
        return record;
    }
    /**
     * Upsert/treat collection as singleton
     */
    async upsertSingleton(data, opts) {
        const primaryKeyField = this.schema.collections[this.collection].primary;
        const record = await this.knex.select(primaryKeyField).from(this.collection).limit(1).first();
        if (record) {
            return await this.updateOne(record[primaryKeyField], data, opts);
        }
        return await this.createOne(data, opts);
    }
}
exports.ItemsService = ItemsService;
