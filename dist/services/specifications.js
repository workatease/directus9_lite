"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpecificationService = void 0;
const format_title_1 = __importDefault(require("@directus/format-title"));
const specs_1 = __importDefault(require("@directus/specs"));
const lodash_1 = require("lodash");
// @ts-ignore
const package_json_1 = require("../../package.json");
const database_1 = __importDefault(require("../database"));
const env_1 = __importDefault(require("../env"));
const get_relation_type_1 = require("../utils/get-relation-type");
const collections_1 = require("./collections");
const fields_1 = require("./fields");
const graphql_1 = require("./graphql");
const relations_1 = require("./relations");
class SpecificationService {
    constructor(options) {
        this.accountability = options.accountability || null;
        this.knex = options.knex || (0, database_1.default)();
        this.schema = options.schema;
        this.fieldsService = new fields_1.FieldsService(options);
        this.collectionsService = new collections_1.CollectionsService(options);
        this.relationsService = new relations_1.RelationsService(options);
        this.oas = new OASSpecsService(options, {
            fieldsService: this.fieldsService,
            collectionsService: this.collectionsService,
            relationsService: this.relationsService,
        });
        this.graphql = new GraphQLSpecsService(options);
    }
}
exports.SpecificationService = SpecificationService;
class OASSpecsService {
    constructor(options, { fieldsService, collectionsService, relationsService, }) {
        this.fieldTypes = {
            alias: {
                type: 'string',
            },
            bigInteger: {
                type: 'integer',
                format: 'int64',
            },
            binary: {
                type: 'string',
                format: 'binary',
            },
            boolean: {
                type: 'boolean',
            },
            csv: {
                type: 'array',
                items: {
                    type: 'string',
                },
            },
            date: {
                type: 'string',
                format: 'date',
            },
            dateTime: {
                type: 'string',
                format: 'date-time',
            },
            decimal: {
                type: 'number',
            },
            float: {
                type: 'number',
                format: 'float',
            },
            hash: {
                type: 'string',
            },
            integer: {
                type: 'integer',
            },
            json: {
                type: 'array',
                items: {
                    type: 'string',
                },
            },
            string: {
                type: 'string',
            },
            text: {
                type: 'string',
            },
            time: {
                type: 'string',
                format: 'time',
            },
            timestamp: {
                type: 'string',
                format: 'timestamp',
            },
            unknown: {
                type: undefined,
            },
            uuid: {
                type: 'string',
                format: 'uuid',
            },
            geometry: {
                type: 'object',
            },
            'geometry.Point': {
                type: 'object',
            },
            'geometry.LineString': {
                type: 'object',
            },
            'geometry.Polygon': {
                type: 'object',
            },
            'geometry.MultiPoint': {
                type: 'object',
            },
            'geometry.MultiLineString': {
                type: 'object',
            },
            'geometry.MultiPolygon': {
                type: 'object',
            },
        };
        this.accountability = options.accountability || null;
        this.knex = options.knex || (0, database_1.default)();
        this.schema = options.schema;
        this.fieldsService = fieldsService;
        this.collectionsService = collectionsService;
        this.relationsService = relationsService;
    }
    async generate() {
        var _a, _b;
        const collections = await this.collectionsService.readByQuery();
        const fields = await this.fieldsService.readAll();
        const relations = (await this.relationsService.readAll());
        const permissions = (_b = (_a = this.accountability) === null || _a === void 0 ? void 0 : _a.permissions) !== null && _b !== void 0 ? _b : [];
        const tags = await this.generateTags(collections);
        const paths = await this.generatePaths(permissions, tags);
        const components = await this.generateComponents(collections, fields, relations, tags);
        const spec = {
            openapi: '3.0.1',
            info: {
                title: 'Dynamic API Specification',
                description: 'This is a dynamically generated API specification for all endpoints existing on the current project.',
                version: package_json_1.version,
            },
            servers: [
                {
                    url: env_1.default.PUBLIC_URL,
                    description: 'Your current Directus instance.',
                },
            ],
            tags,
            paths,
            components,
        };
        return spec;
    }
    async generateTags(collections) {
        var _a;
        const systemTags = (0, lodash_1.cloneDeep)(specs_1.default.tags);
        const tags = [];
        // System tags that don't have an associated collection are always readable to the user
        for (const systemTag of systemTags) {
            if (!systemTag['x-collection']) {
                tags.push(systemTag);
            }
        }
        for (const collection of collections) {
            const isSystem = collection.collection.startsWith('directus_');
            // If the collection is one of the system collections, pull the tag from the static spec
            if (isSystem) {
                for (const tag of specs_1.default.tags) {
                    if (tag['x-collection'] === collection.collection) {
                        tags.push(tag);
                        break;
                    }
                }
            }
            else {
                tags.push({
                    name: 'Items' + (0, format_title_1.default)(collection.collection).replace(/ /g, ''),
                    description: ((_a = collection.meta) === null || _a === void 0 ? void 0 : _a.note) || undefined,
                    'x-collection': collection.collection,
                });
            }
        }
        // Filter out the generic Items information
        return tags.filter((tag) => tag.name !== 'Items');
    }
    async generatePaths(permissions, tags) {
        var _a, _b, _c, _d, _e;
        const paths = {};
        if (!tags)
            return paths;
        for (const tag of tags) {
            const isSystem = 'x-collection' in tag === false || tag['x-collection'].startsWith('directus_');
            if (isSystem) {
                for (const [path, pathItem] of Object.entries(specs_1.default.paths)) {
                    for (const [method, operation] of Object.entries(pathItem)) {
                        if ((_a = operation.tags) === null || _a === void 0 ? void 0 : _a.includes(tag.name)) {
                            if (!paths[path]) {
                                paths[path] = {};
                            }
                            const hasPermission = ((_b = this.accountability) === null || _b === void 0 ? void 0 : _b.admin) === true ||
                                'x-collection' in tag === false ||
                                !!permissions.find((permission) => permission.collection === tag['x-collection'] &&
                                    permission.action === this.getActionForMethod(method));
                            if (hasPermission) {
                                if ('parameters' in pathItem) {
                                    paths[path][method] = {
                                        ...operation,
                                        parameters: [...((_c = pathItem.parameters) !== null && _c !== void 0 ? _c : []), ...((_d = operation === null || operation === void 0 ? void 0 : operation.parameters) !== null && _d !== void 0 ? _d : [])],
                                    };
                                }
                                else {
                                    paths[path][method] = operation;
                                }
                            }
                        }
                    }
                }
            }
            else {
                const listBase = (0, lodash_1.cloneDeep)(specs_1.default.paths['/items/{collection}']);
                const detailBase = (0, lodash_1.cloneDeep)(specs_1.default.paths['/items/{collection}/{id}']);
                const collection = tag['x-collection'];
                for (const method of ['post', 'get', 'patch', 'delete']) {
                    const hasPermission = ((_e = this.accountability) === null || _e === void 0 ? void 0 : _e.admin) === true ||
                        !!permissions.find((permission) => permission.collection === collection && permission.action === this.getActionForMethod(method));
                    if (hasPermission) {
                        if (!paths[`/items/${collection}`])
                            paths[`/items/${collection}`] = {};
                        if (!paths[`/items/${collection}/{id}`])
                            paths[`/items/${collection}/{id}`] = {};
                        if (listBase[method]) {
                            paths[`/items/${collection}`][method] = (0, lodash_1.mergeWith)((0, lodash_1.cloneDeep)(listBase[method]), {
                                description: listBase[method].description.replace('item', collection + ' item'),
                                tags: [tag.name],
                                parameters: 'parameters' in listBase ? this.filterCollectionFromParams(listBase['parameters']) : [],
                                operationId: `${this.getActionForMethod(method)}${tag.name}`,
                                requestBody: ['get', 'delete'].includes(method)
                                    ? undefined
                                    : {
                                        content: {
                                            'application/json': {
                                                schema: {
                                                    oneOf: [
                                                        {
                                                            type: 'array',
                                                            items: {
                                                                $ref: `#/components/schemas/${tag.name}`,
                                                            },
                                                        },
                                                        {
                                                            $ref: `#/components/schemas/${tag.name}`,
                                                        },
                                                    ],
                                                },
                                            },
                                        },
                                    },
                                responses: {
                                    '200': {
                                        content: method === 'delete'
                                            ? undefined
                                            : {
                                                'application/json': {
                                                    schema: {
                                                        properties: {
                                                            data: {
                                                                items: {
                                                                    $ref: `#/components/schemas/${tag.name}`,
                                                                },
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                    },
                                },
                            }, (obj, src) => {
                                if (Array.isArray(obj))
                                    return obj.concat(src);
                            });
                        }
                        if (detailBase[method]) {
                            paths[`/items/${collection}/{id}`][method] = (0, lodash_1.mergeWith)((0, lodash_1.cloneDeep)(detailBase[method]), {
                                description: detailBase[method].description.replace('item', collection + ' item'),
                                tags: [tag.name],
                                operationId: `${this.getActionForMethod(method)}Single${tag.name}`,
                                parameters: 'parameters' in detailBase ? this.filterCollectionFromParams(detailBase['parameters']) : [],
                                requestBody: ['get', 'delete'].includes(method)
                                    ? undefined
                                    : {
                                        content: {
                                            'application/json': {
                                                schema: {
                                                    $ref: `#/components/schemas/${tag.name}`,
                                                },
                                            },
                                        },
                                    },
                                responses: {
                                    '200': {
                                        content: method === 'delete'
                                            ? undefined
                                            : {
                                                'application/json': {
                                                    schema: {
                                                        properties: {
                                                            data: {
                                                                items: {
                                                                    $ref: `#/components/schemas/${tag.name}`,
                                                                },
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                    },
                                },
                            }, (obj, src) => {
                                if (Array.isArray(obj))
                                    return obj.concat(src);
                            });
                        }
                    }
                }
            }
        }
        return paths;
    }
    async generateComponents(collections, fields, relations, tags) {
        let components = (0, lodash_1.cloneDeep)(specs_1.default.components);
        if (!components)
            components = {};
        components.schemas = {};
        if (!tags)
            return;
        for (const collection of collections) {
            const tag = tags.find((tag) => tag['x-collection'] === collection.collection);
            if (!tag)
                continue;
            const isSystem = collection.collection.startsWith('directus_');
            const fieldsInCollection = fields.filter((field) => field.collection === collection.collection);
            if (isSystem) {
                const schemaComponent = (0, lodash_1.cloneDeep)(specs_1.default.components.schemas[tag.name]);
                schemaComponent.properties = {};
                for (const field of fieldsInCollection) {
                    schemaComponent.properties[field.field] =
                        (0, lodash_1.cloneDeep)(specs_1.default.components.schemas[tag.name].properties[field.field]) || this.generateField(field, relations, tags, fields);
                }
                components.schemas[tag.name] = schemaComponent;
            }
            else {
                const schemaComponent = {
                    type: 'object',
                    properties: {},
                    'x-collection': collection.collection,
                };
                for (const field of fieldsInCollection) {
                    schemaComponent.properties[field.field] = this.generateField(field, relations, tags, fields);
                }
                components.schemas[tag.name] = schemaComponent;
            }
        }
        return components;
    }
    filterCollectionFromParams(parameters) {
        return parameters.filter((param) => (param === null || param === void 0 ? void 0 : param.$ref) !== '#/components/parameters/Collection');
    }
    getActionForMethod(method) {
        switch (method) {
            case 'post':
                return 'create';
            case 'patch':
                return 'update';
            case 'delete':
                return 'delete';
            case 'get':
            default:
                return 'read';
        }
    }
    generateField(field, relations, tags, fields) {
        var _a, _b;
        let propertyObject = {
            nullable: (_a = field.schema) === null || _a === void 0 ? void 0 : _a.is_nullable,
            description: ((_b = field.meta) === null || _b === void 0 ? void 0 : _b.note) || undefined,
        };
        const relation = relations.find((relation) => {
            var _a;
            return (relation.collection === field.collection && relation.field === field.field) ||
                (relation.related_collection === field.collection && ((_a = relation.meta) === null || _a === void 0 ? void 0 : _a.one_field) === field.field);
        });
        if (!relation) {
            propertyObject = {
                ...propertyObject,
                ...this.fieldTypes[field.type],
            };
        }
        else {
            const relationType = (0, get_relation_type_1.getRelationType)({
                relation,
                field: field.field,
                collection: field.collection,
            });
            if (relationType === 'm2o') {
                const relatedTag = tags.find((tag) => tag['x-collection'] === relation.related_collection);
                const relatedPrimaryKeyField = fields.find((field) => { var _a; return field.collection === relation.related_collection && ((_a = field.schema) === null || _a === void 0 ? void 0 : _a.is_primary_key); });
                if (!relatedTag || !relatedPrimaryKeyField)
                    return propertyObject;
                propertyObject.oneOf = [
                    {
                        ...this.fieldTypes[relatedPrimaryKeyField.type],
                    },
                    {
                        $ref: `#/components/schemas/${relatedTag.name}`,
                    },
                ];
            }
            else if (relationType === 'o2m') {
                const relatedTag = tags.find((tag) => tag['x-collection'] === relation.collection);
                const relatedPrimaryKeyField = fields.find((field) => { var _a; return field.collection === relation.collection && ((_a = field.schema) === null || _a === void 0 ? void 0 : _a.is_primary_key); });
                if (!relatedTag || !relatedPrimaryKeyField)
                    return propertyObject;
                propertyObject.type = 'array';
                propertyObject.items = {
                    oneOf: [
                        {
                            ...this.fieldTypes[relatedPrimaryKeyField.type],
                        },
                        {
                            $ref: `#/components/schemas/${relatedTag.name}`,
                        },
                    ],
                };
            }
            else if (relationType === 'a2o') {
                const relatedTags = tags.filter((tag) => relation.meta.one_allowed_collections.includes(tag['x-collection']));
                propertyObject.type = 'array';
                propertyObject.items = {
                    oneOf: [
                        {
                            type: 'string',
                        },
                        relatedTags.map((tag) => ({
                            $ref: `#/components/schemas/${tag.name}`,
                        })),
                    ],
                };
            }
        }
        return propertyObject;
    }
}
class GraphQLSpecsService {
    constructor(options) {
        this.accountability = options.accountability || null;
        this.knex = options.knex || (0, database_1.default)();
        this.schema = options.schema;
        this.items = new graphql_1.GraphQLService({ ...options, scope: 'items' });
        this.system = new graphql_1.GraphQLService({ ...options, scope: 'system' });
    }
    async generate(scope) {
        if (scope === 'items')
            return this.items.getSchema('sdl');
        if (scope === 'system')
            return this.system.getSchema('sdl');
        return null;
    }
}
