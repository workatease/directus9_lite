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
exports.RelationsService = void 0;
const relations_1 = require("../database/system-data/relations");
const exceptions_1 = require("../exceptions");
const utils_1 = require("@directus/shared/utils");
const items_1 = require("./items");
const permissions_1 = require("./permissions");
const schema_1 = __importDefault(require("@directus/schema"));
const database_1 = __importStar(require("../database"));
const get_default_index_name_1 = require("../utils/get-default-index-name");
const cache_1 = require("../cache");
class RelationsService {
    constructor(options) {
        this.knex = options.knex || (0, database_1.default)();
        this.permissionsService = new permissions_1.PermissionsService(options);
        this.schemaInspector = options.knex ? (0, schema_1.default)(options.knex) : (0, database_1.getSchemaInspector)();
        this.schema = options.schema;
        this.accountability = options.accountability || null;
        this.relationsItemService = new items_1.ItemsService('directus_relations', {
            knex: this.knex,
            schema: this.schema,
            // We don't set accountability here. If you have read access to certain fields, you are
            // allowed to extract the relations regardless of permissions to directus_relations. This
            // happens in `filterForbidden` down below
        });
        this.systemCache = (0, cache_1.getCache)().systemCache;
    }
    async readAll(collection, opts) {
        if (this.accountability && this.accountability.admin !== true && this.hasReadAccess === false) {
            throw new exceptions_1.ForbiddenException();
        }
        const metaReadQuery = {
            limit: -1,
        };
        if (collection) {
            metaReadQuery.filter = {
                many_collection: {
                    _eq: collection,
                },
            };
        }
        const metaRows = [
            ...(await this.relationsItemService.readByQuery(metaReadQuery, opts)),
            ...relations_1.systemRelationRows,
        ].filter((metaRow) => {
            if (!collection)
                return true;
            return metaRow.many_collection === collection;
        });
        const schemaRows = await this.schemaInspector.foreignKeys(collection);
        const results = this.stitchRelations(metaRows, schemaRows);
        return await this.filterForbidden(results);
    }
    async readOne(collection, field) {
        var _a;
        if (this.accountability && this.accountability.admin !== true) {
            if (this.hasReadAccess === false) {
                throw new exceptions_1.ForbiddenException();
            }
            const permissions = (_a = this.accountability.permissions) === null || _a === void 0 ? void 0 : _a.find((permission) => {
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
        const metaRow = await this.relationsItemService.readByQuery({
            limit: 1,
            filter: {
                _and: [
                    {
                        many_collection: {
                            _eq: collection,
                        },
                    },
                    {
                        many_field: {
                            _eq: field,
                        },
                    },
                ],
            },
        });
        const schemaRow = (await this.schemaInspector.foreignKeys(collection)).find((foreignKey) => foreignKey.column === field);
        const stitched = this.stitchRelations(metaRow, schemaRow ? [schemaRow] : []);
        const results = await this.filterForbidden(stitched);
        if (results.length === 0) {
            throw new exceptions_1.ForbiddenException();
        }
        return results[0];
    }
    /**
     * Create a new relationship / foreign key constraint
     */
    async createOne(relation) {
        if (this.accountability && this.accountability.admin !== true) {
            throw new exceptions_1.ForbiddenException();
        }
        if (!relation.collection) {
            throw new exceptions_1.InvalidPayloadException('"collection" is required');
        }
        if (!relation.field) {
            throw new exceptions_1.InvalidPayloadException('"field" is required');
        }
        if (relation.collection in this.schema.collections === false) {
            throw new exceptions_1.InvalidPayloadException(`Collection "${relation.collection}" doesn't exist`);
        }
        if (relation.field in this.schema.collections[relation.collection].fields === false) {
            throw new exceptions_1.InvalidPayloadException(`Field "${relation.field}" doesn't exist in collection "${relation.collection}"`);
        }
        if (relation.related_collection && relation.related_collection in this.schema.collections === false) {
            throw new exceptions_1.InvalidPayloadException(`Collection "${relation.related_collection}" doesn't exist`);
        }
        const existingRelation = this.schema.relations.find((existingRelation) => existingRelation.collection === relation.collection && existingRelation.field === relation.field);
        if (existingRelation) {
            throw new exceptions_1.InvalidPayloadException(`Field "${relation.field}" in collection "${relation.collection}" already has an associated relationship`);
        }
        const metaRow = {
            ...(relation.meta || {}),
            many_collection: relation.collection,
            many_field: relation.field,
            one_collection: relation.related_collection || null,
        };
        await this.knex.transaction(async (trx) => {
            if (relation.related_collection) {
                await trx.schema.alterTable(relation.collection, async (table) => {
                    var _a;
                    this.alterType(table, relation);
                    const constraintName = (0, get_default_index_name_1.getDefaultIndexName)('foreign', relation.collection, relation.field);
                    const builder = table
                        .foreign(relation.field, constraintName)
                        .references(`${relation.related_collection}.${this.schema.collections[relation.related_collection].primary}`);
                    if ((_a = relation.schema) === null || _a === void 0 ? void 0 : _a.on_delete) {
                        builder.onDelete(relation.schema.on_delete);
                    }
                });
            }
            const relationsItemService = new items_1.ItemsService('directus_relations', {
                knex: trx,
                schema: this.schema,
                // We don't set accountability here. If you have read access to certain fields, you are
                // allowed to extract the relations regardless of permissions to directus_relations. This
                // happens in `filterForbidden` down below
            });
            await relationsItemService.createOne(metaRow);
        });
        await this.systemCache.clear();
    }
    /**
     * Update an existing foreign key constraint
     *
     * Note: You can update anything under meta, but only the `on_delete` trigger under schema
     */
    async updateOne(collection, field, relation) {
        if (this.accountability && this.accountability.admin !== true) {
            throw new exceptions_1.ForbiddenException();
        }
        if (collection in this.schema.collections === false) {
            throw new exceptions_1.InvalidPayloadException(`Collection "${collection}" doesn't exist`);
        }
        if (field in this.schema.collections[collection].fields === false) {
            throw new exceptions_1.InvalidPayloadException(`Field "${field}" doesn't exist in collection "${collection}"`);
        }
        const existingRelation = this.schema.relations.find((existingRelation) => existingRelation.collection === collection && existingRelation.field === field);
        if (!existingRelation) {
            throw new exceptions_1.InvalidPayloadException(`Field "${field}" in collection "${collection}" doesn't have a relationship.`);
        }
        await this.knex.transaction(async (trx) => {
            if (existingRelation.related_collection) {
                await trx.schema.alterTable(collection, async (table) => {
                    var _a;
                    let constraintName = (0, get_default_index_name_1.getDefaultIndexName)('foreign', collection, field);
                    // If the FK already exists in the DB, drop it first
                    if (existingRelation === null || existingRelation === void 0 ? void 0 : existingRelation.schema) {
                        constraintName = existingRelation.schema.constraint_name || constraintName;
                        table.dropForeign(field, constraintName);
                    }
                    this.alterType(table, relation);
                    const builder = table
                        .foreign(field, constraintName || undefined)
                        .references(`${existingRelation.related_collection}.${this.schema.collections[existingRelation.related_collection].primary}`);
                    if ((_a = relation.schema) === null || _a === void 0 ? void 0 : _a.on_delete) {
                        builder.onDelete(relation.schema.on_delete);
                    }
                });
            }
            const relationsItemService = new items_1.ItemsService('directus_relations', {
                knex: trx,
                schema: this.schema,
                // We don't set accountability here. If you have read access to certain fields, you are
                // allowed to extract the relations regardless of permissions to directus_relations. This
                // happens in `filterForbidden` down below
            });
            if (relation.meta) {
                if (existingRelation === null || existingRelation === void 0 ? void 0 : existingRelation.meta) {
                    await relationsItemService.updateOne(existingRelation.meta.id, relation.meta);
                }
                else {
                    await relationsItemService.createOne({
                        ...(relation.meta || {}),
                        many_collection: relation.collection,
                        many_field: relation.field,
                        one_collection: existingRelation.related_collection || null,
                    });
                }
            }
        });
        await this.systemCache.clear();
    }
    /**
     * Delete an existing relationship
     */
    async deleteOne(collection, field) {
        if (this.accountability && this.accountability.admin !== true) {
            throw new exceptions_1.ForbiddenException();
        }
        if (collection in this.schema.collections === false) {
            throw new exceptions_1.InvalidPayloadException(`Collection "${collection}" doesn't exist`);
        }
        if (field in this.schema.collections[collection].fields === false) {
            throw new exceptions_1.InvalidPayloadException(`Field "${field}" doesn't exist in collection "${collection}"`);
        }
        const existingRelation = this.schema.relations.find((existingRelation) => existingRelation.collection === collection && existingRelation.field === field);
        if (!existingRelation) {
            throw new exceptions_1.InvalidPayloadException(`Field "${field}" in collection "${collection}" doesn't have a relationship.`);
        }
        await this.knex.transaction(async (trx) => {
            var _a;
            if ((_a = existingRelation.schema) === null || _a === void 0 ? void 0 : _a.constraint_name) {
                await trx.schema.alterTable(existingRelation.collection, (table) => {
                    table.dropForeign(existingRelation.field, existingRelation.schema.constraint_name);
                });
            }
            if (existingRelation.meta) {
                await trx('directus_relations').delete().where({ many_collection: collection, many_field: field });
            }
        });
        await this.systemCache.clear();
    }
    /**
     * Whether or not the current user has read access to relations
     */
    get hasReadAccess() {
        var _a, _b;
        return !!((_b = (_a = this.accountability) === null || _a === void 0 ? void 0 : _a.permissions) === null || _b === void 0 ? void 0 : _b.find((permission) => {
            return permission.collection === 'directus_relations' && permission.action === 'read';
        }));
    }
    /**
     * Combine raw schema foreign key information with Directus relations meta rows to form final
     * Relation objects
     */
    stitchRelations(metaRows, schemaRows) {
        const results = schemaRows.map((foreignKey) => {
            return {
                collection: foreignKey.table,
                field: foreignKey.column,
                related_collection: foreignKey.foreign_key_table,
                schema: foreignKey,
                meta: metaRows.find((meta) => {
                    if (meta.many_collection !== foreignKey.table)
                        return false;
                    if (meta.many_field !== foreignKey.column)
                        return false;
                    if (meta.one_collection && meta.one_collection !== foreignKey.foreign_key_table)
                        return false;
                    return true;
                }) || null,
            };
        });
        /**
         * Meta rows that don't have a corresponding schema foreign key
         */
        const remainingMetaRows = metaRows
            .filter((meta) => {
            return !results.find((relation) => relation.meta === meta);
        })
            .map((meta) => {
            var _a;
            return {
                collection: meta.many_collection,
                field: meta.many_field,
                related_collection: (_a = meta.one_collection) !== null && _a !== void 0 ? _a : null,
                schema: null,
                meta: meta,
            };
        });
        results.push(...remainingMetaRows);
        return results;
    }
    /**
     * Loop over all relations and filter out the ones that contain collections/fields you don't have
     * permissions to
     */
    async filterForbidden(relations) {
        var _a, _b, _c;
        if (this.accountability === null || ((_a = this.accountability) === null || _a === void 0 ? void 0 : _a.admin) === true)
            return relations;
        const allowedCollections = (_c = (_b = this.accountability.permissions) === null || _b === void 0 ? void 0 : _b.filter((permission) => {
            return permission.action === 'read';
        }).map(({ collection }) => collection)) !== null && _c !== void 0 ? _c : [];
        const allowedFields = this.permissionsService.getAllowedFields('read');
        relations = (0, utils_1.toArray)(relations);
        return relations.filter((relation) => {
            var _a, _b, _c;
            let collectionsAllowed = true;
            let fieldsAllowed = true;
            if (allowedCollections.includes(relation.collection) === false) {
                collectionsAllowed = false;
            }
            if (relation.related_collection && allowedCollections.includes(relation.related_collection) === false) {
                collectionsAllowed = false;
            }
            if (((_a = relation.meta) === null || _a === void 0 ? void 0 : _a.one_allowed_collections) &&
                ((_b = relation.meta) === null || _b === void 0 ? void 0 : _b.one_allowed_collections.every((collection) => allowedCollections.includes(collection))) === false) {
                collectionsAllowed = false;
            }
            if (!allowedFields[relation.collection] ||
                (allowedFields[relation.collection].includes('*') === false &&
                    allowedFields[relation.collection].includes(relation.field) === false)) {
                fieldsAllowed = false;
            }
            if (relation.related_collection &&
                ((_c = relation.meta) === null || _c === void 0 ? void 0 : _c.one_field) &&
                (!allowedFields[relation.related_collection] ||
                    (allowedFields[relation.related_collection].includes('*') === false &&
                        allowedFields[relation.related_collection].includes(relation.meta.one_field) === false))) {
                fieldsAllowed = false;
            }
            return collectionsAllowed && fieldsAllowed;
        });
    }
    /**
     * MySQL Specific
     *
     * MySQL doesn't accept FKs from `int` to `int unsigned`. `knex` defaults `.increments()` to
     * `unsigned`, but defaults regular `int` to `int`. This means that created m2o fields have the
     * wrong type. This step will force the m2o `int` field into `unsigned`, but only if both types are
     * integers, and only if we go from `int` to `int unsigned`.
     *
     * @TODO This is a bit of a hack, and might be better of abstracted elsewhere
     */
    alterType(table, relation) {
        const m2oFieldDBType = this.schema.collections[relation.collection].fields[relation.field].dbType;
        const relatedFieldDBType = this.schema.collections[relation.related_collection].fields[this.schema.collections[relation.related_collection].primary].dbType;
        if (m2oFieldDBType !== relatedFieldDBType && m2oFieldDBType === 'int' && relatedFieldDBType === 'int unsigned') {
            table.specificType(relation.field, 'int unsigned').alter();
        }
    }
}
exports.RelationsService = RelationsService;
