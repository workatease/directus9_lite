"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const payload_1 = require("../services/payload");
const apply_function_to_column_name_1 = require("../utils/apply-function-to-column-name");
const apply_query_1 = __importDefault(require("../utils/apply-query"));
const get_column_1 = require("../utils/get-column");
const strip_function_1 = require("../utils/strip-function");
const utils_1 = require("@directus/shared/utils");
const _1 = __importDefault(require("."));
const helpers_1 = require("../database/helpers");
/**
 * Execute a given AST using Knex. Returns array of items based on requested AST.
 */
async function runAST(originalAST, schema, options) {
    const ast = (0, lodash_1.cloneDeep)(originalAST);
    const knex = (options === null || options === void 0 ? void 0 : options.knex) || (0, _1.default)();
    if (ast.type === 'a2o') {
        const results = {};
        for (const collection of ast.names) {
            results[collection] = await run(collection, ast.children[collection], ast.query[collection]);
        }
        return results;
    }
    else {
        return await run(ast.name, ast.children, (options === null || options === void 0 ? void 0 : options.query) || ast.query);
    }
    async function run(collection, children, query) {
        // Retrieve the database columns to select in the current AST
        const { fieldNodes, primaryKeyField, nestedCollectionNodes } = await parseCurrentLevel(schema, collection, children, query);
        // The actual knex query builder instance. This is a promise that resolves with the raw items from the db
        const dbQuery = getDBQuery(schema, knex, collection, fieldNodes, query);
        const rawItems = await dbQuery;
        if (!rawItems)
            return null;
        // Run the items through the special transforms
        const payloadService = new payload_1.PayloadService(collection, { knex, schema });
        let items = await payloadService.processValues('read', rawItems);
        if (!items || items.length === 0)
            return items;
        // Apply the `_in` filters to the nested collection batches
        const nestedNodes = applyParentFilters(schema, nestedCollectionNodes, items);
        for (const nestedNode of nestedNodes) {
            const nestedItems = await runAST(nestedNode, schema, { knex, nested: true });
            if (nestedItems) {
                // Merge all fetched nested records with the parent items
                items = mergeWithParentItems(schema, nestedItems, items, nestedNode);
            }
        }
        // During the fetching of data, we have to inject a couple of required fields for the child nesting
        // to work (primary / foreign keys) even if they're not explicitly requested. After all fetching
        // and nesting is done, we parse through the output structure, and filter out all non-requested
        // fields
        if ((options === null || options === void 0 ? void 0 : options.nested) !== true && (options === null || options === void 0 ? void 0 : options.stripNonRequested) !== false) {
            items = removeTemporaryFields(schema, items, originalAST, primaryKeyField);
        }
        return items;
    }
}
exports.default = runAST;
async function parseCurrentLevel(schema, collection, children, query) {
    var _a;
    const primaryKeyField = schema.collections[collection].primary;
    const columnsInCollection = Object.keys(schema.collections[collection].fields);
    const columnsToSelectInternal = [];
    const nestedCollectionNodes = [];
    for (const child of children) {
        if (child.type === 'field') {
            const fieldKey = (0, strip_function_1.stripFunction)(child.name);
            if (columnsInCollection.includes(fieldKey) || fieldKey === '*') {
                columnsToSelectInternal.push(child.name); // maintain original name here (includes functions)
                if (query.alias) {
                    columnsToSelectInternal.push(...Object.entries(query.alias)
                        .filter(([_key, value]) => value === child.name)
                        .map(([key]) => key));
                }
            }
            continue;
        }
        if (!child.relation)
            continue;
        if (child.type === 'm2o') {
            columnsToSelectInternal.push(child.fieldKey);
        }
        if (child.type === 'a2o') {
            columnsToSelectInternal.push(child.relation.field);
            columnsToSelectInternal.push(child.relation.meta.one_collection_field);
        }
        nestedCollectionNodes.push(child);
    }
    const isAggregate = (_a = (query.group || (query.aggregate && Object.keys(query.aggregate).length > 0))) !== null && _a !== void 0 ? _a : false;
    /** Always fetch primary key in case there's a nested relation that needs it. Aggregate payloads
     * can't have nested relational fields
     */
    if (isAggregate === false && columnsToSelectInternal.includes(primaryKeyField) === false) {
        columnsToSelectInternal.push(primaryKeyField);
    }
    /** Make sure select list has unique values */
    const columnsToSelect = [...new Set(columnsToSelectInternal)];
    const fieldNodes = columnsToSelect.map((column) => {
        var _a;
        return (_a = children.find((childNode) => childNode.type === 'field' && childNode.fieldKey === column)) !== null && _a !== void 0 ? _a : {
            type: 'field',
            name: column,
            fieldKey: column,
        };
    });
    return { fieldNodes, nestedCollectionNodes, primaryKeyField };
}
function getColumnPreprocessor(knex, schema, table) {
    const helpers = (0, helpers_1.getHelpers)(knex);
    return function (fieldNode) {
        let field;
        if (fieldNode.type === 'field') {
            field = schema.collections[table].fields[(0, strip_function_1.stripFunction)(fieldNode.name)];
        }
        else {
            field = schema.collections[fieldNode.relation.collection].fields[fieldNode.relation.field];
        }
        let alias = undefined;
        if (fieldNode.name !== fieldNode.fieldKey) {
            alias = fieldNode.fieldKey;
        }
        if (field.type.startsWith('geometry')) {
            return helpers.st.asText(table, field.field);
        }
        return (0, get_column_1.getColumn)(knex, table, fieldNode.name, alias);
    };
}
function getDBQuery(schema, knex, table, fieldNodes, query) {
    const preProcess = getColumnPreprocessor(knex, schema, table);
    const dbQuery = knex.select(fieldNodes.map(preProcess)).from(table);
    const queryCopy = (0, lodash_1.clone)(query);
    queryCopy.limit = typeof queryCopy.limit === 'number' ? queryCopy.limit : 100;
    return (0, apply_query_1.default)(knex, table, dbQuery, queryCopy, schema);
}
function applyParentFilters(schema, nestedCollectionNodes, parentItem) {
    var _a;
    const parentItems = (0, utils_1.toArray)(parentItem);
    for (const nestedNode of nestedCollectionNodes) {
        if (!nestedNode.relation)
            continue;
        if (nestedNode.type === 'm2o') {
            const foreignField = schema.collections[nestedNode.relation.related_collection].primary;
            const foreignIds = (0, lodash_1.uniq)(parentItems.map((res) => res[nestedNode.relation.field])).filter((id) => id);
            const limit = nestedNode.query.limit;
            if (limit === -1) {
                (0, lodash_1.merge)(nestedNode, { query: { filter: { [foreignField]: { _in: foreignIds } } } });
            }
            else {
                nestedNode.query.union = [foreignField, foreignIds];
            }
        }
        else if (nestedNode.type === 'o2m') {
            const relatedM2OisFetched = !!nestedNode.children.find((child) => {
                return child.type === 'field' && child.name === nestedNode.relation.field;
            });
            if (relatedM2OisFetched === false) {
                nestedNode.children.push({
                    type: 'field',
                    name: nestedNode.relation.field,
                    fieldKey: nestedNode.relation.field,
                });
            }
            if ((_a = nestedNode.relation.meta) === null || _a === void 0 ? void 0 : _a.sort_field) {
                nestedNode.children.push({
                    type: 'field',
                    name: nestedNode.relation.meta.sort_field,
                    fieldKey: nestedNode.relation.meta.sort_field,
                });
            }
            const foreignField = nestedNode.relation.field;
            const foreignIds = (0, lodash_1.uniq)(parentItems.map((res) => res[nestedNode.parentKey])).filter((id) => id);
            const limit = nestedNode.query.limit;
            if (limit === -1) {
                (0, lodash_1.merge)(nestedNode, { query: { filter: { [foreignField]: { _in: foreignIds } } } });
            }
            else {
                nestedNode.query.union = [foreignField, foreignIds];
            }
        }
        else if (nestedNode.type === 'a2o') {
            const keysPerCollection = {};
            for (const parentItem of parentItems) {
                const collection = parentItem[nestedNode.relation.meta.one_collection_field];
                if (!keysPerCollection[collection])
                    keysPerCollection[collection] = [];
                keysPerCollection[collection].push(parentItem[nestedNode.relation.field]);
            }
            for (const relatedCollection of nestedNode.names) {
                const foreignField = nestedNode.relatedKey[relatedCollection];
                const foreignIds = (0, lodash_1.uniq)(keysPerCollection[relatedCollection]);
                const limit = nestedNode.query[relatedCollection].limit;
                if (limit === -1) {
                    (0, lodash_1.merge)(nestedNode, { query: { [relatedCollection]: { filter: { [foreignField]: { _in: foreignIds } } } } });
                }
                else {
                    nestedNode.query[relatedCollection].union = [foreignField, foreignIds];
                }
            }
        }
    }
    return nestedCollectionNodes;
}
function mergeWithParentItems(schema, nestedItem, parentItem, nestedNode) {
    var _a;
    const nestedItems = (0, utils_1.toArray)(nestedItem);
    const parentItems = (0, lodash_1.clone)((0, utils_1.toArray)(parentItem));
    if (nestedNode.type === 'm2o') {
        for (const parentItem of parentItems) {
            const itemChild = nestedItems.find((nestedItem) => {
                return (nestedItem[schema.collections[nestedNode.relation.related_collection].primary] ==
                    parentItem[nestedNode.fieldKey]);
            });
            parentItem[nestedNode.fieldKey] = itemChild || null;
        }
    }
    else if (nestedNode.type === 'o2m') {
        for (const parentItem of parentItems) {
            const itemChildren = nestedItems
                .filter((nestedItem) => {
                var _a;
                if (nestedItem === null)
                    return false;
                if (Array.isArray(nestedItem[nestedNode.relation.field]))
                    return true;
                return (nestedItem[nestedNode.relation.field] ==
                    parentItem[schema.collections[nestedNode.relation.related_collection].primary] ||
                    ((_a = nestedItem[nestedNode.relation.field]) === null || _a === void 0 ? void 0 : _a[schema.collections[nestedNode.relation.related_collection].primary]) == parentItem[schema.collections[nestedNode.relation.related_collection].primary]);
            })
                .sort((a, b) => {
                // This is pre-filled in get-ast-from-query
                const sortField = nestedNode.query.sort[0];
                let column = sortField;
                let order = 'asc';
                if (sortField.startsWith('-')) {
                    column = sortField.substring(1);
                    order = 'desc';
                }
                if (a[column] === b[column])
                    return 0;
                if (a[column] === null)
                    return 1;
                if (b[column] === null)
                    return -1;
                if (order === 'asc') {
                    return a[column] < b[column] ? -1 : 1;
                }
                else {
                    return a[column] < b[column] ? 1 : -1;
                }
            });
            parentItem[nestedNode.fieldKey] = itemChildren.length > 0 ? itemChildren : [];
        }
    }
    else if (nestedNode.type === 'a2o') {
        for (const parentItem of parentItems) {
            if (!((_a = nestedNode.relation.meta) === null || _a === void 0 ? void 0 : _a.one_collection_field)) {
                parentItem[nestedNode.fieldKey] = null;
                continue;
            }
            const relatedCollection = parentItem[nestedNode.relation.meta.one_collection_field];
            if (!nestedItem[relatedCollection]) {
                parentItem[nestedNode.fieldKey] = null;
                continue;
            }
            const itemChild = nestedItem[relatedCollection].find((nestedItem) => {
                return nestedItem[nestedNode.relatedKey[relatedCollection]] == parentItem[nestedNode.fieldKey];
            });
            parentItem[nestedNode.fieldKey] = itemChild || null;
        }
    }
    return Array.isArray(parentItem) ? parentItems : parentItems[0];
}
function removeTemporaryFields(schema, rawItem, ast, primaryKeyField, parentItem) {
    var _a;
    const rawItems = (0, lodash_1.cloneDeep)((0, utils_1.toArray)(rawItem));
    const items = [];
    if (ast.type === 'a2o') {
        const fields = {};
        const nestedCollectionNodes = {};
        for (const relatedCollection of ast.names) {
            if (!fields[relatedCollection])
                fields[relatedCollection] = [];
            if (!nestedCollectionNodes[relatedCollection])
                nestedCollectionNodes[relatedCollection] = [];
            for (const child of ast.children[relatedCollection]) {
                if (child.type === 'field') {
                    fields[relatedCollection].push(child.name);
                }
                else {
                    fields[relatedCollection].push(child.fieldKey);
                    nestedCollectionNodes[relatedCollection].push(child);
                }
            }
        }
        for (const rawItem of rawItems) {
            const relatedCollection = parentItem === null || parentItem === void 0 ? void 0 : parentItem[ast.relation.meta.one_collection_field];
            if (rawItem === null || rawItem === undefined)
                return rawItem;
            let item = rawItem;
            for (const nestedNode of nestedCollectionNodes[relatedCollection]) {
                item[nestedNode.fieldKey] = removeTemporaryFields(schema, item[nestedNode.fieldKey], nestedNode, schema.collections[nestedNode.relation.collection].primary, item);
            }
            item = fields[relatedCollection].length > 0 ? (0, lodash_1.pick)(rawItem, fields[relatedCollection]) : rawItem[primaryKeyField];
            items.push(item);
        }
    }
    else {
        const fields = [];
        const nestedCollectionNodes = [];
        for (const child of ast.children) {
            fields.push(child.fieldKey);
            if (child.type !== 'field') {
                nestedCollectionNodes.push(child);
            }
        }
        // Make sure any requested aggregate fields are included
        if ((_a = ast.query) === null || _a === void 0 ? void 0 : _a.aggregate) {
            for (const [operation, aggregateFields] of Object.entries(ast.query.aggregate)) {
                if (!fields)
                    continue;
                if (operation === 'count' && aggregateFields.includes('*'))
                    fields.push('count');
                fields.push(...aggregateFields.map((field) => `${operation}.${field}`));
            }
        }
        for (const rawItem of rawItems) {
            if (rawItem === null || rawItem === undefined)
                return rawItem;
            let item = rawItem;
            for (const nestedNode of nestedCollectionNodes) {
                item[nestedNode.fieldKey] = removeTemporaryFields(schema, item[nestedNode.fieldKey], nestedNode, nestedNode.type === 'm2o'
                    ? schema.collections[nestedNode.relation.related_collection].primary
                    : schema.collections[nestedNode.relation.collection].primary, item);
            }
            const fieldsWithFunctionsApplied = fields.map((field) => (0, apply_function_to_column_name_1.applyFunctionToColumnName)(field));
            item = fields.length > 0 ? (0, lodash_1.pick)(rawItem, fieldsWithFunctionsApplied) : rawItem[primaryKeyField];
            items.push(item);
        }
    }
    return Array.isArray(rawItem) ? items : items[0];
}
