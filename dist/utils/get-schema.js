"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSchema = void 0;
const schema_1 = __importDefault(require("@directus/schema"));
const lodash_1 = require("lodash");
const collections_1 = require("../database/system-data/collections");
const fields_1 = require("../database/system-data/fields");
const logger_1 = __importDefault(require("../logger"));
const services_1 = require("../services");
const utils_1 = require("@directus/shared/utils");
const get_default_value_1 = __importDefault(require("./get-default-value"));
const get_local_type_1 = __importDefault(require("./get-local-type"));
const database_1 = __importDefault(require("../database"));
const cache_1 = require("../cache");
const env_1 = __importDefault(require("../env"));
async function getSchema(options) {
    const database = (options === null || options === void 0 ? void 0 : options.database) || (0, database_1.default)();
    const schemaInspector = (0, schema_1.default)(database);
    const { systemCache } = (0, cache_1.getCache)();
    let result;
    if (env_1.default.CACHE_SCHEMA !== false) {
        let cachedSchema;
        try {
            cachedSchema = (await systemCache.get('schema'));
        }
        catch (err) {
            logger_1.default.warn(err, `[schema-cache] Couldn't retrieve cache. ${err}`);
        }
        if (cachedSchema) {
            result = cachedSchema;
        }
        else {
            result = await getDatabaseSchema(database, schemaInspector);
            try {
                await systemCache.set('schema', result);
            }
            catch (err) {
                logger_1.default.warn(err, `[schema-cache] Couldn't save cache. ${err}`);
            }
        }
    }
    else {
        result = await getDatabaseSchema(database, schemaInspector);
    }
    return result;
}
exports.getSchema = getSchema;
async function getDatabaseSchema(database, schemaInspector) {
    var _a, _b, _c, _d;
    const result = {
        collections: {},
        relations: [],
    };
    const schemaOverview = await schemaInspector.overview();
    const collections = [
        ...(await database
            .select('collection', 'singleton', 'note', 'sort_field', 'accountability')
            .from('directus_collections')),
        ...collections_1.systemCollectionRows,
    ];
    for (const [collection, info] of Object.entries(schemaOverview)) {
        if ((0, utils_1.toArray)(env_1.default.DB_EXCLUDE_TABLES).includes(collection)) {
            logger_1.default.trace(`Collection "${collection}" is configured to be excluded and will be ignored`);
            continue;
        }
        if (!info.primary) {
            logger_1.default.warn(`Collection "${collection}" doesn't have a primary key column and will be ignored`);
            continue;
        }
        if (collection.includes(' ')) {
            logger_1.default.warn(`Collection "${collection}" has a space in the name and will be ignored`);
            continue;
        }
        const collectionMeta = collections.find((collectionMeta) => collectionMeta.collection === collection);
        result.collections[collection] = {
            collection,
            primary: info.primary,
            singleton: (collectionMeta === null || collectionMeta === void 0 ? void 0 : collectionMeta.singleton) === true || (collectionMeta === null || collectionMeta === void 0 ? void 0 : collectionMeta.singleton) === 'true' || (collectionMeta === null || collectionMeta === void 0 ? void 0 : collectionMeta.singleton) === 1,
            note: (collectionMeta === null || collectionMeta === void 0 ? void 0 : collectionMeta.note) || null,
            sortField: (collectionMeta === null || collectionMeta === void 0 ? void 0 : collectionMeta.sort_field) || null,
            accountability: collectionMeta ? collectionMeta.accountability : 'all',
            fields: (0, lodash_1.mapValues)(schemaOverview[collection].columns, (column) => {
                var _a, _b, _c;
                return {
                    field: column.column_name,
                    defaultValue: (_a = (0, get_default_value_1.default)(column)) !== null && _a !== void 0 ? _a : null,
                    nullable: (_b = column.is_nullable) !== null && _b !== void 0 ? _b : true,
                    generated: (_c = column.is_generated) !== null && _c !== void 0 ? _c : false,
                    type: (0, get_local_type_1.default)(column),
                    dbType: column.data_type,
                    precision: column.numeric_precision || null,
                    scale: column.numeric_scale || null,
                    special: [],
                    note: null,
                    alias: false,
                };
            }),
        };
    }
    const fields = [
        ...(await database
            .select('id', 'collection', 'field', 'special', 'note')
            .from('directus_fields')),
        ...fields_1.systemFieldRows,
    ].filter((field) => (field.special ? (0, utils_1.toArray)(field.special) : []).includes('no-data') === false);
    for (const field of fields) {
        if (!result.collections[field.collection])
            continue;
        const existing = result.collections[field.collection].fields[field.field];
        const column = schemaOverview[field.collection].columns[field.field];
        const special = field.special ? (0, utils_1.toArray)(field.special) : [];
        const type = (existing && (0, get_local_type_1.default)(column, { special })) || 'alias';
        result.collections[field.collection].fields[field.field] = {
            field: field.field,
            defaultValue: (_a = existing === null || existing === void 0 ? void 0 : existing.defaultValue) !== null && _a !== void 0 ? _a : null,
            nullable: (_b = existing === null || existing === void 0 ? void 0 : existing.nullable) !== null && _b !== void 0 ? _b : true,
            generated: (_c = existing === null || existing === void 0 ? void 0 : existing.generated) !== null && _c !== void 0 ? _c : false,
            type: type,
            dbType: (existing === null || existing === void 0 ? void 0 : existing.dbType) || null,
            precision: (existing === null || existing === void 0 ? void 0 : existing.precision) || null,
            scale: (existing === null || existing === void 0 ? void 0 : existing.scale) || null,
            special: special,
            note: field.note,
            alias: (_d = existing === null || existing === void 0 ? void 0 : existing.alias) !== null && _d !== void 0 ? _d : true,
        };
    }
    const relationsService = new services_1.RelationsService({ knex: database, schema: result });
    result.relations = await relationsService.readAll();
    return result;
}
