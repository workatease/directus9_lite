"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FieldsService = void 0;
const schema_1 = __importDefault(require("@directus/schema"));
const cache_1 = require("../cache");
const constants_1 = require("../constants");
const database_1 = __importStar(require("../database"));
const fields_1 = require("../database/system-data/fields/");
const emitter_1 = __importDefault(require("../emitter"));
const env_1 = __importDefault(require("../env"));
const exceptions_1 = require("../exceptions");
const translate_1 = require("../exceptions/database/translate");
const items_1 = require("../services/items");
const payload_1 = require("../services/payload");
const get_default_value_1 = __importDefault(require("../utils/get-default-value"));
const get_local_type_1 = __importDefault(require("../utils/get-local-type"));
const utils_1 = require("@directus/shared/utils");
const lodash_1 = require("lodash");
const relations_1 = require("./relations");
const helpers_1 = require("../database/helpers");
class FieldsService {
    constructor(options) {
        this.knex = options.knex || (0, database_1.default)();
        this.helpers = (0, helpers_1.getHelpers)(this.knex);
        this.schemaInspector = options.knex ? (0, schema_1.default)(options.knex) : (0, database_1.getSchemaInspector)();
        this.accountability = options.accountability || null;
        this.itemsService = new items_1.ItemsService('directus_fields', options);
        this.payloadService = new payload_1.PayloadService('directus_fields', options);
        this.schema = options.schema;
        const { cache, systemCache } = (0, cache_1.getCache)();
        this.cache = cache;
        this.systemCache = systemCache;
    }
    get hasReadAccess() {
        var _a, _b;
        return !!((_b = (_a = this.accountability) === null || _a === void 0 ? void 0 : _a.permissions) === null || _b === void 0 ? void 0 : _b.find((permission) => {
            return permission.collection === 'directus_fields' && permission.action === 'read';
        }));
    }
    async readAll(collection) {
        let fields;
        if (this.accountability && this.accountability.admin !== true && this.hasReadAccess === false) {
            throw new exceptions_1.ForbiddenException();
        }
        const nonAuthorizedItemsService = new items_1.ItemsService('directus_fields', {
            knex: this.knex,
            schema: this.schema,
        });
        if (collection) {
            fields = (await nonAuthorizedItemsService.readByQuery({
                filter: { collection: { _eq: collection } },
                limit: -1,
            }));
            fields.push(...fields_1.systemFieldRows.filter((fieldMeta) => fieldMeta.collection === collection));
        }
        else {
            fields = (await nonAuthorizedItemsService.readByQuery({ limit: -1 }));
            fields.push(...fields_1.systemFieldRows);
        }
        const columns = (await this.schemaInspector.columnInfo(collection)).map((column) => ({
            ...column,
            default_value: (0, get_default_value_1.default)(column),
        }));
        const columnsWithSystem = columns.map((column) => {
            const field = fields.find((field) => {
                return field.field === column.name && field.collection === column.table;
            });
            const type = (0, get_local_type_1.default)(column, field);
            const data = {
                collection: column.table,
                field: column.name,
                type: type,
                schema: column,
                meta: field || null,
            };
            return data;
        });
        const aliasQuery = this.knex.select('*').from('directus_fields');
        if (collection) {
            aliasQuery.andWhere('collection', collection);
        }
        let aliasFields = [...(await this.payloadService.processValues('read', await aliasQuery))];
        if (collection) {
            aliasFields.push(...fields_1.systemFieldRows.filter((fieldMeta) => fieldMeta.collection === collection));
        }
        else {
            aliasFields.push(...fields_1.systemFieldRows);
        }
        aliasFields = aliasFields.filter((field) => {
            const specials = (0, utils_1.toArray)(field.special);
            for (const type of constants_1.ALIAS_TYPES) {
                if (specials.includes(type))
                    return true;
            }
            return false;
        });
        const aliasFieldsAsField = aliasFields.map((field) => {
            const type = (0, get_local_type_1.default)(undefined, field);
            const data = {
                collection: field.collection,
                field: field.field,
                type,
                schema: null,
                meta: field,
            };
            return data;
        });
        const knownCollections = Object.keys(this.schema.collections);
        const result = [...columnsWithSystem, ...aliasFieldsAsField].filter((field) => knownCollections.includes(field.collection));
        // Filter the result so we only return the fields you have read access to
        if (this.accountability && this.accountability.admin !== true) {
            const permissions = this.accountability.permissions.filter((permission) => {
                return permission.action === 'read';
            });
            const allowedFieldsInCollection = {};
            permissions.forEach((permission) => {
                var _a;
                allowedFieldsInCollection[permission.collection] = (_a = permission.fields) !== null && _a !== void 0 ? _a : [];
            });
            if (collection && collection in allowedFieldsInCollection === false) {
                throw new exceptions_1.ForbiddenException();
            }
            return result.filter((field) => {
                if (field.collection in allowedFieldsInCollection === false)
                    return false;
                const allowedFields = allowedFieldsInCollection[field.collection];
                if (allowedFields[0] === '*')
                    return true;
                return allowedFields.includes(field.field);
            });
        }
        return result;
    }
    async readOne(collection, field) {
        if (this.accountability && this.accountability.admin !== true) {
            if (this.hasReadAccess === false) {
                throw new exceptions_1.ForbiddenException();
            }
            const permissions = this.accountability.permissions.find((permission) => {
                return permission.action === 'read' && permission.collection === collection;
            });
            if (!permissions || !permissions.fields)
                throw new exceptions_1.ForbiddenException();
            if (permissions.fields.includes('*') === false) {
                const allowedFields = permissions.fields;
                if (allowedFields.includes(field) === false)
                    throw new exceptions_1.ForbiddenException();
            }
        }
        let column = undefined;
        let fieldInfo = await this.knex.select('*').from('directus_fields').where({ collection, field }).first();
        if (fieldInfo) {
            fieldInfo = (await this.payloadService.processValues('read', fieldInfo));
        }
        fieldInfo =
            fieldInfo ||
                fields_1.systemFieldRows.find((fieldMeta) => fieldMeta.collection === collection && fieldMeta.field === field);
        try {
            column = await this.schemaInspector.columnInfo(collection, field);
            column.default_value = (0, get_default_value_1.default)(column);
        }
        catch {
            // Do nothing
        }
        const type = (0, get_local_type_1.default)(column, fieldInfo);
        const data = {
            collection,
            field,
            type,
            meta: fieldInfo || null,
            schema: type === 'alias' ? null : column,
        };
        return data;
    }
    async createField(collection, field, table // allows collection creation to
    ) {
        if (this.accountability && this.accountability.admin !== true) {
            throw new exceptions_1.ForbiddenException();
        }
        const exists = field.field in this.schema.collections[collection].fields ||
            (0, lodash_1.isNil)(await this.knex.select('id').from('directus_fields').where({ collection, field: field.field }).first()) ===
                false;
        // Check if field already exists, either as a column, or as a row in directus_fields
        if (exists) {
            throw new exceptions_1.InvalidPayloadException(`Field "${field.field}" already exists in collection "${collection}"`);
        }
        await this.knex.transaction(async (trx) => {
            const itemsService = new items_1.ItemsService('directus_fields', {
                knex: trx,
                accountability: this.accountability,
                schema: this.schema,
            });
            const hookAdjustedField = await emitter_1.default.emitFilter(`fields.create`, field, {
                collection: collection,
            }, {
                database: trx,
                schema: this.schema,
                accountability: this.accountability,
            });
            if (hookAdjustedField.type && constants_1.ALIAS_TYPES.includes(hookAdjustedField.type) === false) {
                if (table) {
                    this.addColumnToTable(table, hookAdjustedField);
                }
                else {
                    await trx.schema.alterTable(collection, (table) => {
                        this.addColumnToTable(table, hookAdjustedField);
                    });
                }
            }
            if (hookAdjustedField.meta) {
                await itemsService.createOne({
                    ...hookAdjustedField.meta,
                    collection: collection,
                    field: hookAdjustedField.field,
                }, { emitEvents: false });
            }
            emitter_1.default.emitAction(`fields.create`, {
                payload: hookAdjustedField,
                key: hookAdjustedField.field,
                collection: collection,
            }, {
                database: (0, database_1.default)(),
                schema: this.schema,
                accountability: this.accountability,
            });
        });
        if (this.cache && env_1.default.CACHE_AUTO_PURGE) {
            await this.cache.clear();
        }
        await this.systemCache.clear();
    }
    async updateField(collection, field) {
        if (this.accountability && this.accountability.admin !== true) {
            throw new exceptions_1.ForbiddenException();
        }
        const hookAdjustedField = await emitter_1.default.emitFilter(`fields.update`, field, {
            keys: [field.field],
            collection: collection,
        }, {
            database: this.knex,
            schema: this.schema,
            accountability: this.accountability,
        });
        const record = field.meta
            ? await this.knex.select('id').from('directus_fields').where({ collection, field: field.field }).first()
            : null;
        if (hookAdjustedField.schema) {
            const existingColumn = await this.schemaInspector.columnInfo(collection, hookAdjustedField.field);
            if (!(0, lodash_1.isEqual)(existingColumn, hookAdjustedField.schema)) {
                try {
                    await this.knex.schema.alterTable(collection, (table) => {
                        if (!hookAdjustedField.schema)
                            return;
                        this.addColumnToTable(table, field, existingColumn);
                    });
                }
                catch (err) {
                    throw await (0, translate_1.translateDatabaseError)(err);
                }
            }
        }
        if (hookAdjustedField.meta) {
            if (record) {
                await this.itemsService.updateOne(record.id, {
                    ...hookAdjustedField.meta,
                    collection: collection,
                    field: hookAdjustedField.field,
                }, { emitEvents: false });
            }
            else {
                await this.itemsService.createOne({
                    ...hookAdjustedField.meta,
                    collection: collection,
                    field: hookAdjustedField.field,
                }, { emitEvents: false });
            }
        }
        if (this.cache && env_1.default.CACHE_AUTO_PURGE) {
            await this.cache.clear();
        }
        await this.systemCache.clear();
        emitter_1.default.emitAction(`fields.update`, {
            payload: hookAdjustedField,
            keys: [hookAdjustedField.field],
            collection: collection,
        }, {
            database: (0, database_1.default)(),
            schema: this.schema,
            accountability: this.accountability,
        });
        return field.field;
    }
    async deleteField(collection, field) {
        if (this.accountability && this.accountability.admin !== true) {
            throw new exceptions_1.ForbiddenException();
        }
        await emitter_1.default.emitFilter('fields.delete', [field], {
            collection: collection,
        }, {
            database: this.knex,
            schema: this.schema,
            accountability: this.accountability,
        });
        await this.knex.transaction(async (trx) => {
            var _a, _b;
            if (this.schema.collections[collection] &&
                field in this.schema.collections[collection].fields &&
                this.schema.collections[collection].fields[field].alias === false) {
                await trx.schema.table(collection, (table) => {
                    table.dropColumn(field);
                });
            }
            const relations = this.schema.relations.filter((relation) => {
                var _a;
                return ((relation.collection === collection && relation.field === field) ||
                    (relation.related_collection === collection && ((_a = relation.meta) === null || _a === void 0 ? void 0 : _a.one_field) === field));
            });
            const relationsService = new relations_1.RelationsService({
                knex: trx,
                accountability: this.accountability,
                schema: this.schema,
            });
            const fieldsService = new FieldsService({
                knex: trx,
                accountability: this.accountability,
                schema: this.schema,
            });
            for (const relation of relations) {
                const isM2O = relation.collection === collection && relation.field === field;
                // If the current field is a m2o, delete the related o2m if it exists and remove the relationship
                if (isM2O) {
                    await relationsService.deleteOne(collection, field);
                    if (relation.related_collection && ((_a = relation.meta) === null || _a === void 0 ? void 0 : _a.one_field)) {
                        await fieldsService.deleteField(relation.related_collection, relation.meta.one_field);
                    }
                }
                // If the current field is a o2m, just delete the one field config from the relation
                if (!isM2O && ((_b = relation.meta) === null || _b === void 0 ? void 0 : _b.one_field)) {
                    await trx('directus_relations')
                        .update({ one_field: null })
                        .where({ many_collection: relation.collection, many_field: relation.field });
                }
            }
            const collectionMeta = await trx
                .select('archive_field', 'sort_field')
                .from('directus_collections')
                .where({ collection })
                .first();
            const collectionMetaUpdates = {};
            if ((collectionMeta === null || collectionMeta === void 0 ? void 0 : collectionMeta.archive_field) === field) {
                collectionMetaUpdates.archive_field = null;
            }
            if ((collectionMeta === null || collectionMeta === void 0 ? void 0 : collectionMeta.sort_field) === field) {
                collectionMetaUpdates.sort_field = null;
            }
            if (Object.keys(collectionMetaUpdates).length > 0) {
                await trx('directus_collections').update(collectionMetaUpdates).where({ collection });
            }
            // Cleanup directus_fields
            const metaRow = await trx
                .select('collection', 'field')
                .from('directus_fields')
                .where({ collection, field })
                .first();
            if (metaRow) {
                // Handle recursive FK constraints
                await trx('directus_fields')
                    .update({ group: null })
                    .where({ group: metaRow.field, collection: metaRow.collection });
            }
            await trx('directus_fields').delete().where({ collection, field });
        });
        if (this.cache && env_1.default.CACHE_AUTO_PURGE) {
            await this.cache.clear();
        }
        await this.systemCache.clear();
        emitter_1.default.emitAction('fields.delete', {
            payload: [field],
            collection: collection,
        }, {
            database: this.knex,
            schema: this.schema,
            accountability: this.accountability,
        });
    }
    addColumnToTable(table, field, alter = null) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        let column;
        // Don't attempt to add a DB column for alias / corrupt fields
        if (field.type === 'alias' || field.type === 'unknown')
            return;
        if ((_a = field.schema) === null || _a === void 0 ? void 0 : _a.has_auto_increment) {
            column = table.increments(field.field);
        }
        else if (field.type === 'string') {
            column = table.string(field.field, (_c = (_b = field.schema) === null || _b === void 0 ? void 0 : _b.max_length) !== null && _c !== void 0 ? _c : undefined);
        }
        else if (['float', 'decimal'].includes(field.type)) {
            const type = field.type;
            column = table[type](field.field, ((_d = field.schema) === null || _d === void 0 ? void 0 : _d.numeric_precision) || 10, ((_e = field.schema) === null || _e === void 0 ? void 0 : _e.numeric_scale) || 5);
        }
        else if (field.type === 'csv') {
            column = table.string(field.field);
        }
        else if (field.type === 'hash') {
            column = table.string(field.field, 255);
        }
        else if (field.type === 'dateTime') {
            column = table.dateTime(field.field, { useTz: false });
        }
        else if (field.type === 'timestamp') {
            column = table.timestamp(field.field, { useTz: true });
        }
        else if (field.type.startsWith('geometry')) {
            column = this.helpers.st.createColumn(table, field);
        }
        else {
            // @ts-ignore
            column = table[field.type](field.field);
        }
        if (((_f = field.schema) === null || _f === void 0 ? void 0 : _f.default_value) !== undefined) {
            if (typeof field.schema.default_value === 'string' && field.schema.default_value.toLowerCase() === 'now()') {
                column.defaultTo(this.knex.fn.now());
            }
            else if (typeof field.schema.default_value === 'string' &&
                ['"null"', 'null'].includes(field.schema.default_value.toLowerCase())) {
                column.defaultTo(null);
            }
            else {
                column.defaultTo(field.schema.default_value);
            }
        }
        if (((_g = field.schema) === null || _g === void 0 ? void 0 : _g.is_nullable) === false) {
            if (!alter || alter.is_nullable === true) {
                column.notNullable();
            }
        }
        else if (((_h = field.schema) === null || _h === void 0 ? void 0 : _h.is_nullable) === true) {
            if (!alter || alter.is_nullable === false) {
                column.nullable();
            }
        }
        if ((_j = field.schema) === null || _j === void 0 ? void 0 : _j.is_primary_key) {
            column.primary().notNullable();
        }
        else if (((_k = field.schema) === null || _k === void 0 ? void 0 : _k.is_unique) === true) {
            if (!alter || alter.is_unique === false) {
                column.unique();
            }
        }
        else if (((_l = field.schema) === null || _l === void 0 ? void 0 : _l.is_unique) === false) {
            if (alter && alter.is_unique === true) {
                table.dropUnique([field.field]);
            }
        }
        if (alter) {
            column.alter();
        }
    }
}
exports.FieldsService = FieldsService;
