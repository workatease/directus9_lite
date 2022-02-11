"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyAggregate = exports.applySearch = exports.applyFilter = void 0;
const lodash_1 = require("lodash");
const nanoid_1 = require("nanoid");
const uuid_validate_1 = __importDefault(require("uuid-validate"));
const exceptions_1 = require("../exceptions");
const get_column_1 = require("./get-column");
const get_relation_type_1 = require("./get-relation-type");
const helpers_1 = require("../database/helpers");
const generateAlias = (0, nanoid_1.customAlphabet)('abcdefghijklmnopqrstuvwxyz', 5);
/**
 * Apply the Query to a given Knex query builder instance
 */
function applyQuery(knex, collection, dbQuery, query, schema, subQuery = false) {
    if (query.sort) {
        dbQuery.orderBy(query.sort.map((sortField) => {
            let column = sortField;
            let order = 'asc';
            if (sortField.startsWith('-')) {
                column = column.substring(1);
                order = 'desc';
            }
            return {
                order,
                column: (0, get_column_1.getColumn)(knex, collection, column, false),
            };
        }));
    }
    if (typeof query.limit === 'number' && query.limit !== -1) {
        dbQuery.limit(query.limit);
    }
    if (query.offset) {
        dbQuery.offset(query.offset);
    }
    if (query.page && query.limit && query.limit !== -1) {
        dbQuery.offset(query.limit * (query.page - 1));
    }
    if (query.search) {
        applySearch(schema, dbQuery, query.search, collection);
    }
    if (query.group) {
        dbQuery.groupBy(query.group.map((column) => (0, get_column_1.getColumn)(knex, collection, column, false)));
    }
    if (query.aggregate) {
        applyAggregate(dbQuery, query.aggregate, collection);
    }
    if (query.union && query.union[1].length > 0) {
        const [field, keys] = query.union;
        const queries = keys.map((key) => {
            const unionFilter = { [field]: { _eq: key } };
            let filter = (0, lodash_1.cloneDeep)(query.filter);
            if (filter) {
                if ('_and' in filter) {
                    filter._and.push(unionFilter);
                }
                else {
                    filter = {
                        _and: [filter, unionFilter],
                    };
                }
            }
            else {
                filter = unionFilter;
            }
            return knex.select('*').from(applyFilter(knex, schema, dbQuery.clone(), filter, collection, subQuery).as('foo'));
        });
        dbQuery = knex.unionAll(queries);
    }
    else if (query.filter) {
        applyFilter(knex, schema, dbQuery, query.filter, collection, subQuery);
    }
    return dbQuery;
}
exports.default = applyQuery;
function getRelationInfo(relations, collection, field) {
    var _a, _b;
    const implicitRelation = (_a = field.match(/^\$FOLLOW\((.*?),(.*?)(?:,(.*?))?\)$/)) === null || _a === void 0 ? void 0 : _a.slice(1);
    if (implicitRelation) {
        if (implicitRelation[2] === undefined) {
            const [m2oCollection, m2oField] = implicitRelation;
            const relation = {
                collection: m2oCollection,
                field: m2oField,
                related_collection: collection,
                schema: null,
                meta: null,
            };
            return { relation, relationType: 'o2m' };
        }
        else {
            const [a2oCollection, a2oItemField, a2oCollectionField] = implicitRelation;
            const relation = {
                collection: a2oCollection,
                field: a2oItemField,
                related_collection: collection,
                schema: null,
                meta: {
                    one_collection_field: a2oCollectionField,
                    one_field: field,
                },
            };
            return { relation, relationType: 'o2a' };
        }
    }
    const relation = (_b = relations.find((relation) => {
        var _a;
        return ((relation.collection === collection && relation.field === field) ||
            (relation.related_collection === collection && ((_a = relation.meta) === null || _a === void 0 ? void 0 : _a.one_field) === field));
    })) !== null && _b !== void 0 ? _b : null;
    const relationType = relation ? (0, get_relation_type_1.getRelationType)({ relation, collection, field }) : null;
    return { relation, relationType };
}
function applyFilter(knex, schema, rootQuery, rootFilter, collection, subQuery = false) {
    const helpers = (0, helpers_1.getHelpers)(knex);
    const relations = schema.relations;
    const aliasMap = {};
    addJoins(rootQuery, rootFilter, collection);
    addWhereClauses(knex, rootQuery, rootFilter, collection);
    return rootQuery;
    function addJoins(dbQuery, filter, collection) {
        for (const [key, value] of Object.entries(filter)) {
            if (key === '_or' || key === '_and') {
                // If the _or array contains an empty object (full permissions), we should short-circuit and ignore all other
                // permission checks, as {} already matches full permissions.
                if (key === '_or' && value.some((subFilter) => Object.keys(subFilter).length === 0))
                    continue;
                value.forEach((subFilter) => {
                    addJoins(dbQuery, subFilter, collection);
                });
                continue;
            }
            const filterPath = getFilterPath(key, value);
            if (filterPath.length > 1) {
                addJoin(filterPath, collection);
            }
        }
        function addJoin(path, collection) {
            path = (0, lodash_1.clone)(path);
            followRelation(path);
            function followRelation(pathParts, parentCollection = collection, parentAlias) {
                /**
                 * For A2M fields, the path can contain an optional collection scope <field>:<scope>
                 */
                const pathRoot = pathParts[0].split(':')[0];
                const { relation, relationType } = getRelationInfo(relations, parentCollection, pathRoot);
                if (!relation) {
                    return;
                }
                const alias = generateAlias();
                (0, lodash_1.set)(aliasMap, parentAlias ? [parentAlias, ...pathParts] : pathParts, alias);
                if (relationType === 'm2o') {
                    dbQuery.leftJoin({ [alias]: relation.related_collection }, `${parentAlias || parentCollection}.${relation.field}`, `${alias}.${schema.collections[relation.related_collection].primary}`);
                }
                if (relationType === 'a2o') {
                    const pathScope = pathParts[0].split(':')[1];
                    if (!pathScope) {
                        throw new exceptions_1.InvalidQueryException(`You have to provide a collection scope when filtering on a many-to-any item`);
                    }
                    dbQuery.leftJoin({ [alias]: pathScope }, (joinClause) => {
                        joinClause
                            .onVal(relation.meta.one_collection_field, '=', pathScope)
                            .andOn(`${parentAlias || parentCollection}.${relation.field}`, '=', knex.raw(`CAST(?? AS CHAR(255))`, `${alias}.${schema.collections[pathScope].primary}`));
                    });
                }
                if (relationType === 'o2a') {
                    dbQuery.leftJoin({ [alias]: relation.collection }, (joinClause) => {
                        joinClause
                            .onVal(relation.meta.one_collection_field, '=', parentCollection)
                            .andOn(`${alias}.${relation.field}`, '=', knex.raw(`CAST(?? AS CHAR(255))`, `${parentAlias || parentCollection}.${schema.collections[parentCollection].primary}`));
                    });
                }
                // Still join o2m relations when in subquery OR when the o2m relation is not at the root level
                if (relationType === 'o2m' && (subQuery === true || parentAlias !== undefined)) {
                    dbQuery.leftJoin({ [alias]: relation.collection }, `${parentAlias || parentCollection}.${schema.collections[relation.related_collection].primary}`, `${alias}.${relation.field}`);
                }
                if (relationType === 'm2o' || subQuery === true || (relationType === 'o2m' && parentAlias !== undefined)) {
                    let parent;
                    if (relationType === 'm2o') {
                        parent = relation.related_collection;
                    }
                    else if (relationType === 'a2o') {
                        const pathScope = pathParts[0].split(':')[1];
                        if (!pathScope) {
                            throw new exceptions_1.InvalidQueryException(`You have to provide a collection scope when filtering on a many-to-any item`);
                        }
                        parent = pathScope;
                    }
                    else {
                        parent = relation.collection;
                    }
                    pathParts.shift();
                    if (pathParts.length) {
                        followRelation(pathParts, parent, alias);
                    }
                }
            }
        }
    }
    function addWhereClauses(knex, dbQuery, filter, collection, logical = 'and') {
        for (const [key, value] of Object.entries(filter)) {
            if (key === '_or' || key === '_and') {
                // If the _or array contains an empty object (full permissions), we should short-circuit and ignore all other
                // permission checks, as {} already matches full permissions.
                if (key === '_or' && value.some((subFilter) => Object.keys(subFilter).length === 0)) {
                    continue;
                }
                /** @NOTE this callback function isn't called until Knex runs the query */
                dbQuery[logical].where((subQuery) => {
                    value.forEach((subFilter) => {
                        addWhereClauses(knex, subQuery, subFilter, collection, key === '_and' ? 'and' : 'or');
                    });
                });
                continue;
            }
            const filterPath = getFilterPath(key, value);
            /**
             * For A2M fields, the path can contain an optional collection scope <field>:<scope>
             */
            const pathRoot = filterPath[0].split(':')[0];
            const { relation, relationType } = getRelationInfo(relations, collection, pathRoot);
            const { operator: filterOperator, value: filterValue } = getOperation(key, value);
            if (relationType === 'm2o' || relationType === 'a2o' || relationType === null) {
                if (filterPath.length > 1) {
                    const columnName = getWhereColumn(filterPath, collection);
                    if (!columnName)
                        continue;
                    applyFilterToQuery(columnName, filterOperator, filterValue, logical);
                }
                else {
                    applyFilterToQuery(`${collection}.${filterPath[0]}`, filterOperator, filterValue, logical);
                }
            }
            else if (subQuery === false) {
                if (!relation)
                    continue;
                let pkField = `${collection}.${schema.collections[relation.related_collection].primary}`;
                if (relationType === 'o2a') {
                    pkField = knex.raw(`CAST(?? AS CHAR(255))`, [pkField]);
                }
                // Note: knex's types don't appreciate knex.raw in whereIn, even though it's officially supported
                dbQuery[logical].whereIn(pkField, (subQueryKnex) => {
                    const field = relation.field;
                    const collection = relation.collection;
                    const column = `${collection}.${field}`;
                    subQueryKnex.select({ [field]: column }).from(collection);
                    applyQuery(knex, relation.collection, subQueryKnex, {
                        filter: value,
                    }, schema, true);
                });
            }
        }
        function applyFilterToQuery(key, operator, compareValue, logical = 'and') {
            const [table, column] = key.split('.');
            // Is processed through Knex.Raw, so should be safe to string-inject into these where queries
            const selectionRaw = (0, get_column_1.getColumn)(knex, table, column, false);
            // Knex supports "raw" in the columnName parameter, but isn't typed as such. Too bad..
            // See https://github.com/knex/knex/issues/4518 @TODO remove as any once knex is updated
            // These operators don't rely on a value, and can thus be used without one (eg `?filter[field][_null]`)
            if (operator === '_null' || (operator === '_nnull' && compareValue === false)) {
                dbQuery[logical].whereNull(selectionRaw);
            }
            if (operator === '_nnull' || (operator === '_null' && compareValue === false)) {
                dbQuery[logical].whereNotNull(selectionRaw);
            }
            if (operator === '_empty' || (operator === '_nempty' && compareValue === false)) {
                dbQuery[logical].andWhere((query) => {
                    query.where(key, '=', '');
                });
            }
            if (operator === '_nempty' || (operator === '_empty' && compareValue === false)) {
                dbQuery[logical].andWhere((query) => {
                    query.where(key, '!=', '');
                });
            }
            const [collection, field] = key.split('.');
            if (collection in schema.collections && field in schema.collections[collection].fields) {
                const type = schema.collections[collection].fields[field].type;
                if (['date', 'dateTime', 'time', 'timestamp'].includes(type)) {
                    if (Array.isArray(compareValue)) {
                        compareValue = compareValue.map((val) => helpers.date.parse(val));
                    }
                    else {
                        compareValue = helpers.date.parse(compareValue);
                    }
                }
            }
            // The following fields however, require a value to be run. If no value is passed, we
            // ignore them. This allows easier use in GraphQL, where you wouldn't be able to
            // conditionally build out your filter structure (#4471)
            if (compareValue === undefined)
                return;
            if (Array.isArray(compareValue)) {
                // Tip: when using a `[Type]` type in GraphQL, but don't provide the variable, it'll be
                // reported as [undefined].
                // We need to remove any undefined values, as they are useless
                compareValue = compareValue.filter((val) => val !== undefined);
            }
            if (operator === '_eq') {
                dbQuery[logical].where(selectionRaw, '=', compareValue);
            }
            if (operator === '_neq') {
                dbQuery[logical].whereNot(selectionRaw, compareValue);
            }
            if (operator === '_contains') {
                dbQuery[logical].where(selectionRaw, 'like', `%${compareValue}%`);
            }
            if (operator === '_ncontains') {
                dbQuery[logical].whereNot(selectionRaw, 'like', `%${compareValue}%`);
            }
            if (operator === '_starts_with') {
                dbQuery[logical].where(key, 'like', `${compareValue}%`);
            }
            if (operator === '_nstarts_with') {
                dbQuery[logical].whereNot(key, 'like', `${compareValue}%`);
            }
            if (operator === '_ends_with') {
                dbQuery[logical].where(key, 'like', `%${compareValue}`);
            }
            if (operator === '_nends_with') {
                dbQuery[logical].whereNot(key, 'like', `%${compareValue}`);
            }
            if (operator === '_gt') {
                dbQuery[logical].where(selectionRaw, '>', compareValue);
            }
            if (operator === '_gte') {
                dbQuery[logical].where(selectionRaw, '>=', compareValue);
            }
            if (operator === '_lt') {
                dbQuery[logical].where(selectionRaw, '<', compareValue);
            }
            if (operator === '_lte') {
                dbQuery[logical].where(selectionRaw, '<=', compareValue);
            }
            if (operator === '_in') {
                let value = compareValue;
                if (typeof value === 'string')
                    value = value.split(',');
                dbQuery[logical].whereIn(selectionRaw, value);
            }
            if (operator === '_nin') {
                let value = compareValue;
                if (typeof value === 'string')
                    value = value.split(',');
                dbQuery[logical].whereNotIn(selectionRaw, value);
            }
            if (operator === '_between') {
                if (compareValue.length !== 2)
                    return;
                let value = compareValue;
                if (typeof value === 'string')
                    value = value.split(',');
                dbQuery[logical].whereBetween(selectionRaw, value);
            }
            if (operator === '_nbetween') {
                if (compareValue.length !== 2)
                    return;
                let value = compareValue;
                if (typeof value === 'string')
                    value = value.split(',');
                dbQuery[logical].whereNotBetween(selectionRaw, value);
            }
            if (operator == '_intersects') {
                dbQuery[logical].whereRaw(helpers.st.intersects(key, compareValue));
            }
            if (operator == '_nintersects') {
                dbQuery[logical].whereRaw(helpers.st.nintersects(key, compareValue));
            }
            if (operator == '_intersects_bbox') {
                dbQuery[logical].whereRaw(helpers.st.intersects_bbox(key, compareValue));
            }
            if (operator == '_nintersects_bbox') {
                dbQuery[logical].whereRaw(helpers.st.nintersects_bbox(key, compareValue));
            }
        }
        function getWhereColumn(path, collection) {
            return followRelation(path);
            function followRelation(pathParts, parentCollection = collection, parentAlias) {
                /**
                 * For A2M fields, the path can contain an optional collection scope <field>:<scope>
                 */
                const pathRoot = pathParts[0].split(':')[0];
                const { relation, relationType } = getRelationInfo(relations, parentCollection, pathRoot);
                if (!relation) {
                    throw new exceptions_1.InvalidQueryException(`"${parentCollection}.${pathRoot}" is not a relational field`);
                }
                const alias = (0, lodash_1.get)(aliasMap, parentAlias ? [parentAlias, ...pathParts] : pathParts);
                const remainingParts = pathParts.slice(1);
                let parent;
                if (relationType === 'a2o') {
                    const pathScope = pathParts[0].split(':')[1];
                    if (!pathScope) {
                        throw new exceptions_1.InvalidQueryException(`You have to provide a collection scope when filtering on a many-to-any item`);
                    }
                    parent = pathScope;
                }
                else if (relationType === 'm2o') {
                    parent = relation.related_collection;
                }
                else {
                    parent = relation.collection;
                }
                if (remainingParts.length === 1) {
                    return `${alias || parent}.${remainingParts[0]}`;
                }
                if (remainingParts.length) {
                    return followRelation(remainingParts, parent, alias);
                }
            }
        }
    }
}
exports.applyFilter = applyFilter;
async function applySearch(schema, dbQuery, searchQuery, collection) {
    const fields = Object.entries(schema.collections[collection].fields);
    dbQuery.andWhere(function () {
        fields.forEach(([name, field]) => {
            if (['text', 'string'].includes(field.type)) {
                this.orWhereRaw(`LOWER(??) LIKE ?`, [`${collection}.${name}`, `%${searchQuery.toLowerCase()}%`]);
            }
            else if (['bigInteger', 'integer', 'decimal', 'float'].includes(field.type)) {
                const number = Number(searchQuery);
                if (!isNaN(number))
                    this.orWhere({ [`${collection}.${name}`]: number });
            }
            else if (field.type === 'uuid' && (0, uuid_validate_1.default)(searchQuery)) {
                this.orWhere({ [`${collection}.${name}`]: searchQuery });
            }
        });
    });
}
exports.applySearch = applySearch;
function applyAggregate(dbQuery, aggregate, collection) {
    for (const [operation, fields] of Object.entries(aggregate)) {
        if (!fields)
            continue;
        for (const field of fields) {
            if (operation === 'avg') {
                dbQuery.avg(`${collection}.${field}`, { as: `avg->${field}` });
            }
            if (operation === 'avgDistinct') {
                dbQuery.avgDistinct(`${collection}.${field}`, { as: `avgDistinct->${field}` });
            }
            if (operation === 'count') {
                if (field === '*') {
                    dbQuery.count('*', { as: 'count' });
                }
                else {
                    dbQuery.count(`${collection}.${field}`, { as: `count->${field}` });
                }
            }
            if (operation === 'countDistinct') {
                dbQuery.countDistinct(`${collection}.${field}`, { as: `countDistinct->${field}` });
            }
            if (operation === 'sum') {
                dbQuery.sum(`${collection}.${field}`, { as: `sum->${field}` });
            }
            if (operation === 'sumDistinct') {
                dbQuery.sumDistinct(`${collection}.${field}`, { as: `sumDistinct->${field}` });
            }
            if (operation === 'min') {
                dbQuery.min(`${collection}.${field}`, { as: `min->${field}` });
            }
            if (operation === 'max') {
                dbQuery.max(`${collection}.${field}`, { as: `max->${field}` });
            }
        }
    }
}
exports.applyAggregate = applyAggregate;
function getFilterPath(key, value) {
    const path = [key];
    if (typeof Object.keys(value)[0] === 'string' && Object.keys(value)[0].startsWith('_') === true) {
        return path;
    }
    if ((0, lodash_1.isPlainObject)(value)) {
        path.push(...getFilterPath(Object.keys(value)[0], Object.values(value)[0]));
    }
    return path;
}
function getOperation(key, value) {
    if (key.startsWith('_') && key !== '_and' && key !== '_or') {
        return { operator: key, value };
    }
    else if ((0, lodash_1.isPlainObject)(value) === false) {
        return { operator: '_eq', value };
    }
    return getOperation(Object.keys(value)[0], Object.values(value)[0]);
}
