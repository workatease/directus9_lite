"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayloadService = void 0;
const date_fns_1 = require("date-fns");
const joi_1 = __importDefault(require("joi"));
const lodash_1 = require("lodash");
const uuid_1 = require("uuid");
const database_1 = __importDefault(require("../database"));
const exceptions_1 = require("../exceptions");
const utils_1 = require("@directus/shared/utils");
const items_1 = require("./items");
const flat_1 = require("flat");
const helpers_1 = require("../database/helpers");
const wellknown_1 = require("wellknown");
const generate_hash_1 = require("../utils/generate-hash");
/**
 * Process a given payload for a collection to ensure the special fields (hash, uuid, date etc) are
 * handled correctly.
 */
class PayloadService {
    constructor(collection, options) {
        this.transformers = {
            async hash({ action, value }) {
                if (!value)
                    return;
                if (action === 'create' || action === 'update') {
                    return await (0, generate_hash_1.generateHash)(String(value));
                }
                return value;
            },
            async uuid({ action, value }) {
                if (action === 'create' && !value) {
                    return (0, uuid_1.v4)();
                }
                return value;
            },
            async boolean({ action, value }) {
                if (action === 'read') {
                    if (value === true || value === 1 || value === '1') {
                        return true;
                    }
                    else if (value === false || value === 0 || value === '0') {
                        return false;
                    }
                    else if (value === null || value === '') {
                        return null;
                    }
                }
                return value;
            },
            async json({ action, value }) {
                if (action === 'read') {
                    if (typeof value === 'string') {
                        try {
                            return JSON.parse(value);
                        }
                        catch {
                            return value;
                        }
                    }
                }
                return value;
            },
            async conceal({ action, value }) {
                if (action === 'read')
                    return value ? '**********' : null;
                return value;
            },
            async 'user-created'({ action, value, accountability }) {
                if (action === 'create')
                    return (accountability === null || accountability === void 0 ? void 0 : accountability.user) || null;
                return value;
            },
            async 'user-updated'({ action, value, accountability }) {
                if (action === 'update')
                    return (accountability === null || accountability === void 0 ? void 0 : accountability.user) || null;
                return value;
            },
            async 'role-created'({ action, value, accountability }) {
                if (action === 'create')
                    return (accountability === null || accountability === void 0 ? void 0 : accountability.role) || null;
                return value;
            },
            async 'role-updated'({ action, value, accountability }) {
                if (action === 'update')
                    return (accountability === null || accountability === void 0 ? void 0 : accountability.role) || null;
                return value;
            },
            async 'date-created'({ action, value }) {
                if (action === 'create')
                    return new Date();
                return value;
            },
            async 'date-updated'({ action, value }) {
                if (action === 'update')
                    return new Date();
                return value;
            },
            async csv({ action, value }) {
                if (Array.isArray(value) === false && typeof value !== 'string')
                    return;
                if (action === 'read' && Array.isArray(value) === false) {
                    if (value === '')
                        return [];
                    return value.split(',');
                }
                if (Array.isArray(value)) {
                    return value.join(',');
                }
                return value;
            },
        };
        this.accountability = options.accountability || null;
        this.knex = options.knex || (0, database_1.default)();
        this.helpers = (0, helpers_1.getHelpers)(this.knex);
        this.collection = collection;
        this.schema = options.schema;
        return this;
    }
    async processValues(action, payload) {
        const processedPayload = (0, utils_1.toArray)(payload);
        if (processedPayload.length === 0)
            return [];
        const fieldsInPayload = Object.keys(processedPayload[0]);
        let specialFieldsInCollection = Object.entries(this.schema.collections[this.collection].fields).filter(([_name, field]) => field.special && field.special.length > 0);
        if (action === 'read') {
            specialFieldsInCollection = specialFieldsInCollection.filter(([name]) => {
                return fieldsInPayload.includes(name);
            });
        }
        await Promise.all(processedPayload.map(async (record) => {
            await Promise.all(specialFieldsInCollection.map(async ([name, field]) => {
                const newValue = await this.processField(field, record, action, this.accountability);
                if (newValue !== undefined)
                    record[name] = newValue;
            }));
        }));
        this.processGeometries(processedPayload, action);
        this.processDates(processedPayload, action);
        if (['create', 'update'].includes(action)) {
            processedPayload.forEach((record) => {
                for (const [key, value] of Object.entries(record)) {
                    if (Array.isArray(value) || (typeof value === 'object' && !(value instanceof Date) && value !== null)) {
                        if (!value.isRawInstance) {
                            record[key] = JSON.stringify(value);
                        }
                    }
                }
            });
        }
        if (action === 'read') {
            this.processAggregates(processedPayload);
        }
        if (Array.isArray(payload)) {
            return processedPayload;
        }
        return processedPayload[0];
    }
    processAggregates(payload) {
        const aggregateKeys = Object.keys(payload[0]).filter((key) => key.includes('->'));
        if (aggregateKeys.length) {
            for (const item of payload) {
                Object.assign(item, (0, flat_1.unflatten)((0, lodash_1.pick)(item, aggregateKeys), { delimiter: '->' }));
                aggregateKeys.forEach((key) => delete item[key]);
            }
        }
    }
    async processField(field, payload, action, accountability) {
        if (!field.special)
            return payload[field.field];
        const fieldSpecials = field.special ? (0, utils_1.toArray)(field.special) : [];
        let value = (0, lodash_1.clone)(payload[field.field]);
        for (const special of fieldSpecials) {
            if (special in this.transformers) {
                value = await this.transformers[special]({
                    action,
                    value,
                    payload,
                    accountability,
                    specials: fieldSpecials,
                });
            }
        }
        return value;
    }
    /**
     * Native geometries are stored in custom binary format. We need to insert them with
     * the function st_geomfromtext. For this to work, that function call must not be
     * escaped. It's therefore placed as a Knex.Raw object in the payload. Thus the need
     * to check if the value is a raw instance before stringifying it in the next step.
     */
    processGeometries(payloads, action) {
        const process = action == 'read'
            ? (value) => (typeof value === 'string' ? (0, wellknown_1.parse)(value) : value)
            : (value) => this.helpers.st.fromGeoJSON(typeof value == 'string' ? JSON.parse(value) : value);
        const fieldsInCollection = Object.entries(this.schema.collections[this.collection].fields);
        const geometryColumns = fieldsInCollection.filter(([_, field]) => field.type.startsWith('geometry'));
        for (const [name] of geometryColumns) {
            for (const payload of payloads) {
                if (payload[name]) {
                    payload[name] = process(payload[name]);
                }
            }
        }
        return payloads;
    }
    /**
     * Knex returns `datetime` and `date` columns as Date.. This is wrong for date / datetime, as those
     * shouldn't return with time / timezone info respectively
     */
    processDates(payloads, action) {
        const fieldsInCollection = Object.entries(this.schema.collections[this.collection].fields);
        const dateColumns = fieldsInCollection.filter(([_name, field]) => ['dateTime', 'date', 'timestamp'].includes(field.type));
        const timeColumns = fieldsInCollection.filter(([_name, field]) => {
            return field.type === 'time';
        });
        if (dateColumns.length === 0 && timeColumns.length === 0)
            return payloads;
        for (const [name, dateColumn] of dateColumns) {
            for (const payload of payloads) {
                let value = payload[name];
                if (value === null || value === '0000-00-00') {
                    payload[name] = null;
                    continue;
                }
                if (!value)
                    continue;
                if (action === 'read') {
                    if (typeof value === 'number' || typeof value === 'string') {
                        value = new Date(value);
                    }
                    if (dateColumn.type === 'timestamp') {
                        const newValue = value.toISOString();
                        payload[name] = newValue;
                    }
                    if (dateColumn.type === 'dateTime') {
                        const year = String(value.getUTCFullYear());
                        const month = String(value.getUTCMonth() + 1).padStart(2, '0');
                        const date = String(value.getUTCDate()).padStart(2, '0');
                        const hours = String(value.getUTCHours()).padStart(2, '0');
                        const minutes = String(value.getUTCMinutes()).padStart(2, '0');
                        const seconds = String(value.getUTCSeconds()).padStart(2, '0');
                        const newValue = `${year}-${month}-${date}T${hours}:${minutes}:${seconds}`;
                        payload[name] = newValue;
                    }
                    if (dateColumn.type === 'date') {
                        const [year, month, day] = value.toISOString().substr(0, 10).split('-');
                        // Strip off the time / timezone information from a date-only value
                        const newValue = `${year}-${month}-${day}`;
                        payload[name] = newValue;
                    }
                }
                else {
                    if (value instanceof Date === false && typeof value === 'string') {
                        if (dateColumn.type === 'date') {
                            const [date] = value.split('T');
                            const [year, month, day] = date.split('-');
                            payload[name] = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
                        }
                        if (dateColumn.type === 'dateTime') {
                            const [date, time] = value.split('T');
                            const [year, month, day] = date.split('-');
                            const [hours, minutes, seconds] = time.substring(0, 8).split(':');
                            payload[name] = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds)));
                        }
                        if (dateColumn.type === 'timestamp') {
                            const newValue = (0, date_fns_1.parseISO)(value);
                            payload[name] = newValue;
                        }
                    }
                }
            }
        }
        /**
         * Some DB drivers (MS SQL f.e.) return time values as Date objects. For consistencies sake,
         * we'll abstract those back to hh:mm:ss
         */
        for (const [name] of timeColumns) {
            for (const payload of payloads) {
                const value = payload[name];
                if (!value)
                    continue;
                if (action === 'read') {
                    if (value instanceof Date)
                        payload[name] = (0, date_fns_1.format)(value, 'HH:mm:ss');
                }
            }
        }
        return payloads;
    }
    /**
     * Recursively save/update all nested related Any-to-One items
     */
    async processA2O(data) {
        var _a, _b;
        const relations = this.schema.relations.filter((relation) => {
            return relation.collection === this.collection;
        });
        const revisions = [];
        const payload = (0, lodash_1.cloneDeep)(data);
        // Only process related records that are actually in the payload
        const relationsToProcess = relations.filter((relation) => {
            return relation.field in payload && (0, lodash_1.isPlainObject)(payload[relation.field]);
        });
        for (const relation of relationsToProcess) {
            // If the required a2o configuration fields are missing, this is a m2o instead of an a2o
            if (!((_a = relation.meta) === null || _a === void 0 ? void 0 : _a.one_collection_field) || !((_b = relation.meta) === null || _b === void 0 ? void 0 : _b.one_allowed_collections))
                continue;
            const relatedCollection = payload[relation.meta.one_collection_field];
            if (!relatedCollection) {
                throw new exceptions_1.InvalidPayloadException(`Can't update nested record "${relation.collection}.${relation.field}" without field "${relation.collection}.${relation.meta.one_collection_field}" being set`);
            }
            const allowedCollections = relation.meta.one_allowed_collections;
            if (allowedCollections.includes(relatedCollection) === false) {
                throw new exceptions_1.InvalidPayloadException(`"${relation.collection}.${relation.field}" can't be linked to collection "${relatedCollection}`);
            }
            const itemsService = new items_1.ItemsService(relatedCollection, {
                accountability: this.accountability,
                knex: this.knex,
                schema: this.schema,
            });
            const relatedPrimary = this.schema.collections[relatedCollection].primary;
            const relatedRecord = payload[relation.field];
            if (['string', 'number'].includes(typeof relatedRecord))
                continue;
            const hasPrimaryKey = relatedPrimary in relatedRecord;
            let relatedPrimaryKey = relatedRecord[relatedPrimary];
            const exists = hasPrimaryKey &&
                !!(await this.knex
                    .select(relatedPrimary)
                    .from(relatedCollection)
                    .where({ [relatedPrimary]: relatedPrimaryKey })
                    .first());
            if (exists) {
                const fieldsToUpdate = (0, lodash_1.omit)(relatedRecord, relatedPrimary);
                if (Object.keys(fieldsToUpdate).length > 0) {
                    await itemsService.updateOne(relatedPrimaryKey, relatedRecord, {
                        onRevisionCreate: (pk) => revisions.push(pk),
                    });
                }
            }
            else {
                relatedPrimaryKey = await itemsService.createOne(relatedRecord, {
                    onRevisionCreate: (pk) => revisions.push(pk),
                });
            }
            // Overwrite the nested object with just the primary key, so the parent level can be saved correctly
            payload[relation.field] = relatedPrimaryKey;
        }
        return { payload, revisions };
    }
    /**
     * Save/update all nested related m2o items inside the payload
     */
    async processM2O(data) {
        const payload = (0, lodash_1.cloneDeep)(data);
        // All the revisions saved on this level
        const revisions = [];
        // Many to one relations that exist on the current collection
        const relations = this.schema.relations.filter((relation) => {
            return relation.collection === this.collection;
        });
        // Only process related records that are actually in the payload
        const relationsToProcess = relations.filter((relation) => {
            return relation.field in payload && (0, lodash_1.isObject)(payload[relation.field]);
        });
        for (const relation of relationsToProcess) {
            // If no "one collection" exists, this is a A2O, not a M2O
            if (!relation.related_collection)
                continue;
            const relatedPrimaryKeyField = this.schema.collections[relation.related_collection].primary;
            // Items service to the related collection
            const itemsService = new items_1.ItemsService(relation.related_collection, {
                accountability: this.accountability,
                knex: this.knex,
                schema: this.schema,
            });
            const relatedRecord = payload[relation.field];
            if (['string', 'number'].includes(typeof relatedRecord))
                continue;
            const hasPrimaryKey = relatedPrimaryKeyField in relatedRecord;
            let relatedPrimaryKey = relatedRecord[relatedPrimaryKeyField];
            const exists = hasPrimaryKey &&
                !!(await this.knex
                    .select(relatedPrimaryKeyField)
                    .from(relation.related_collection)
                    .where({ [relatedPrimaryKeyField]: relatedPrimaryKey })
                    .first());
            if (exists) {
                const fieldsToUpdate = (0, lodash_1.omit)(relatedRecord, relatedPrimaryKeyField);
                if (Object.keys(fieldsToUpdate).length > 0) {
                    await itemsService.updateOne(relatedPrimaryKey, relatedRecord, {
                        onRevisionCreate: (pk) => revisions.push(pk),
                    });
                }
            }
            else {
                relatedPrimaryKey = await itemsService.createOne(relatedRecord, {
                    onRevisionCreate: (pk) => revisions.push(pk),
                });
            }
            // Overwrite the nested object with just the primary key, so the parent level can be saved correctly
            payload[relation.field] = relatedPrimaryKey;
        }
        return { payload, revisions };
    }
    /**
     * Recursively save/update all nested related o2m items
     */
    async processO2M(data, parent) {
        const revisions = [];
        const relations = this.schema.relations.filter((relation) => {
            return relation.related_collection === this.collection;
        });
        const payload = (0, lodash_1.cloneDeep)(data);
        // Only process related records that are actually in the payload
        const relationsToProcess = relations.filter((relation) => {
            var _a;
            if (!((_a = relation.meta) === null || _a === void 0 ? void 0 : _a.one_field))
                return false;
            return relation.meta.one_field in payload;
        });
        const nestedUpdateSchema = joi_1.default.object({
            create: joi_1.default.array().items(joi_1.default.object().unknown()),
            update: joi_1.default.array().items(joi_1.default.object().unknown()),
            delete: joi_1.default.array().items(joi_1.default.string(), joi_1.default.number()),
        });
        for (const relation of relationsToProcess) {
            if (!relation.meta || !payload[relation.meta.one_field])
                continue;
            const currentPrimaryKeyField = this.schema.collections[relation.related_collection].primary;
            const relatedPrimaryKeyField = this.schema.collections[relation.collection].primary;
            const itemsService = new items_1.ItemsService(relation.collection, {
                accountability: this.accountability,
                knex: this.knex,
                schema: this.schema,
            });
            const recordsToUpsert = [];
            const savedPrimaryKeys = [];
            // Nested array of individual items
            if (Array.isArray(payload[relation.meta.one_field])) {
                for (let i = 0; i < (payload[relation.meta.one_field] || []).length; i++) {
                    const relatedRecord = (payload[relation.meta.one_field] || [])[i];
                    let record = (0, lodash_1.cloneDeep)(relatedRecord);
                    if (typeof relatedRecord === 'string' || typeof relatedRecord === 'number') {
                        const existingRecord = await this.knex
                            .select(relatedPrimaryKeyField, relation.field)
                            .from(relation.collection)
                            .where({ [relatedPrimaryKeyField]: record })
                            .first();
                        if (!!existingRecord === false) {
                            throw new exceptions_1.ForbiddenException();
                        }
                        // If the related item is already associated to the current item, and there's no
                        // other updates (which is indicated by the fact that this is just the PK, we can
                        // ignore updating this item. This makes sure we don't trigger any update logic
                        // for items that aren't actually being updated. NOTE: We use == here, as the
                        // primary key might be reported as a string instead of number, coming from the
                        // http route, and or a bigInteger in the DB
                        if ((0, lodash_1.isNil)(existingRecord[relation.field]) === false &&
                            (existingRecord[relation.field] == parent ||
                                existingRecord[relation.field] == payload[currentPrimaryKeyField])) {
                            savedPrimaryKeys.push(existingRecord[relatedPrimaryKeyField]);
                            continue;
                        }
                        record = {
                            [relatedPrimaryKeyField]: relatedRecord,
                        };
                    }
                    recordsToUpsert.push({
                        ...record,
                        [relation.field]: parent || payload[currentPrimaryKeyField],
                    });
                }
                savedPrimaryKeys.push(...(await itemsService.upsertMany(recordsToUpsert, {
                    onRevisionCreate: (pk) => revisions.push(pk),
                })));
                const query = {
                    filter: {
                        _and: [
                            {
                                [relation.field]: {
                                    _eq: parent,
                                },
                            },
                            {
                                [relatedPrimaryKeyField]: {
                                    _nin: savedPrimaryKeys,
                                },
                            },
                        ],
                    },
                };
                // Nullify all related items that aren't included in the current payload
                if (relation.meta.one_deselect_action === 'delete') {
                    // There's no revision for a deletion
                    await itemsService.deleteByQuery(query);
                }
                else {
                    await itemsService.updateByQuery(query, { [relation.field]: null }, {
                        onRevisionCreate: (pk) => revisions.push(pk),
                    });
                }
            }
            // "Updates" object w/ create/update/delete
            else {
                const alterations = payload[relation.meta.one_field];
                const { error } = nestedUpdateSchema.validate(alterations);
                if (error)
                    throw new exceptions_1.InvalidPayloadException(`Invalid one-to-many update structure: ${error.message}`);
                if (alterations.create) {
                    await itemsService.createMany(alterations.create.map((item) => ({
                        ...item,
                        [relation.field]: parent || payload[currentPrimaryKeyField],
                    })), {
                        onRevisionCreate: (pk) => revisions.push(pk),
                    });
                }
                if (alterations.update) {
                    const primaryKeyField = this.schema.collections[relation.collection].primary;
                    for (const item of alterations.update) {
                        await itemsService.updateOne(item[primaryKeyField], {
                            ...item,
                            [relation.field]: parent || payload[currentPrimaryKeyField],
                        }, {
                            onRevisionCreate: (pk) => revisions.push(pk),
                        });
                    }
                }
                if (alterations.delete) {
                    const query = {
                        filter: {
                            _and: [
                                {
                                    [relation.field]: {
                                        _eq: parent,
                                    },
                                },
                                {
                                    [relatedPrimaryKeyField]: {
                                        _in: alterations.delete,
                                    },
                                },
                            ],
                        },
                    };
                    if (relation.meta.one_deselect_action === 'delete') {
                        await itemsService.deleteByQuery(query);
                    }
                    else {
                        await itemsService.updateByQuery(query, { [relation.field]: null }, {
                            onRevisionCreate: (pk) => revisions.push(pk),
                        });
                    }
                }
            }
        }
        return { revisions };
    }
    /**
     * Transforms the input partial payload to match the output structure, to have consistency
     * between delta and data
     */
    async prepareDelta(data) {
        var _a;
        let payload = (0, lodash_1.cloneDeep)(data);
        for (const key in payload) {
            if ((_a = payload[key]) === null || _a === void 0 ? void 0 : _a.isRawInstance) {
                payload[key] = payload[key].bindings[0];
            }
        }
        payload = await this.processValues('read', payload);
        return JSON.stringify(payload);
    }
}
exports.PayloadService = PayloadService;
