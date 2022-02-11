"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateQuery = void 0;
const joi_1 = __importDefault(require("joi"));
const lodash_1 = require("lodash");
const exceptions_1 = require("../exceptions");
const wellknown_1 = require("wellknown");
const querySchema = joi_1.default.object({
    fields: joi_1.default.array().items(joi_1.default.string()),
    group: joi_1.default.array().items(joi_1.default.string()),
    sort: joi_1.default.array().items(joi_1.default.string()),
    filter: joi_1.default.object({}).unknown(),
    limit: joi_1.default.number(),
    offset: joi_1.default.number(),
    page: joi_1.default.number(),
    meta: joi_1.default.array().items(joi_1.default.string().valid('total_count', 'filter_count')),
    search: joi_1.default.string(),
    export: joi_1.default.string().valid('json', 'csv', 'xml'),
    aggregate: joi_1.default.object(),
    deep: joi_1.default.object(),
    alias: joi_1.default.object(),
}).id('query');
function validateQuery(query) {
    const { error } = querySchema.validate(query);
    if (query.filter && Object.keys(query.filter).length > 0) {
        validateFilter(query.filter);
    }
    if (query.alias) {
        validateAlias(query.alias);
    }
    if (error) {
        throw new exceptions_1.InvalidQueryException(error.message);
    }
    return query;
}
exports.validateQuery = validateQuery;
function validateFilter(filter) {
    if (!filter)
        throw new exceptions_1.InvalidQueryException('Invalid filter object');
    for (const [key, nested] of Object.entries(filter)) {
        if (key === '_and' || key === '_or') {
            nested.forEach(validateFilter);
        }
        else if (key.startsWith('_')) {
            const value = nested;
            switch (key) {
                case '_eq':
                case '_neq':
                case '_contains':
                case '_ncontains':
                case '_starts_with':
                case '_nstarts_with':
                case '_ends_with':
                case '_nends_with':
                case '_gt':
                case '_gte':
                case '_lt':
                case '_lte':
                default:
                    validateFilterPrimitive(value, key);
                    break;
                case '_in':
                case '_nin':
                case '_between':
                case '_nbetween':
                    validateList(value, key);
                    break;
                case '_null':
                case '_nnull':
                case '_empty':
                case '_nempty':
                    validateBoolean(value, key);
                    break;
                case '_intersects':
                case '_nintersects':
                case '_intersects_bbox':
                case '_nintersects_bbox':
                    validateGeometry(value, key);
                    break;
            }
        }
        else if ((0, lodash_1.isPlainObject)(nested)) {
            validateFilter(nested);
        }
        else if (Array.isArray(nested) === false) {
            validateFilterPrimitive(nested, '_eq');
        }
        else {
            validateFilter(nested);
        }
    }
}
function validateFilterPrimitive(value, key) {
    if (value === null)
        return true;
    if ((typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) ===
        false) {
        throw new exceptions_1.InvalidQueryException(`The filter value for "${key}" has to be a string, number, or boolean`);
    }
    if (typeof value === 'number' && (Number.isNaN(value) || !Number.isSafeInteger(value))) {
        throw new exceptions_1.InvalidQueryException(`The filter value for "${key}" is not a valid number`);
    }
    if (typeof value === 'string' && value.length === 0) {
        throw new exceptions_1.InvalidQueryException(`You can't filter for an empty string in "${key}". Use "_empty" or "_nempty" instead`);
    }
    return true;
}
function validateList(value, key) {
    if (Array.isArray(value) === false || value.length === 0) {
        throw new exceptions_1.InvalidQueryException(`"${key}" has to be an array of values`);
    }
    return true;
}
function validateBoolean(value, key) {
    if (value === null)
        return true;
    if (typeof value !== 'boolean') {
        throw new exceptions_1.InvalidQueryException(`"${key}" has to be a boolean`);
    }
    return true;
}
function validateGeometry(value, key) {
    if (value === null)
        return true;
    try {
        (0, wellknown_1.stringify)(value);
    }
    catch {
        throw new exceptions_1.InvalidQueryException(`"${key}" has to be a valid GeoJSON object`);
    }
    return true;
}
function validateAlias(alias) {
    if ((0, lodash_1.isPlainObject)(alias) === false) {
        throw new exceptions_1.InvalidQueryException(`"alias" has to be an object`);
    }
    for (const [key, value] of Object.entries(alias)) {
        if (typeof key !== 'string') {
            throw new exceptions_1.InvalidQueryException(`"alias" key has to be a string. "${typeof key}" given.`);
        }
        if (typeof value !== 'string') {
            throw new exceptions_1.InvalidQueryException(`"alias" value has to be a string. "${typeof key}" given.`);
        }
        if (key.includes('.') || value.includes('.')) {
            throw new exceptions_1.InvalidQueryException(`"alias" key/value can't contain a period character \`.\``);
        }
    }
}
