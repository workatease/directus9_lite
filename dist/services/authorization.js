"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthorizationService = void 0;
const lodash_1 = require("lodash");
const database_1 = __importDefault(require("../database"));
const exceptions_1 = require("../exceptions");
const exceptions_2 = require("@directus/shared/exceptions");
const utils_1 = require("@directus/shared/utils");
const items_1 = require("./items");
const payload_1 = require("./payload");
class AuthorizationService {
    constructor(options) {
        this.knex = options.knex || (0, database_1.default)();
        this.accountability = options.accountability || null;
        this.schema = options.schema;
        this.payloadService = new payload_1.PayloadService('directus_permissions', {
            knex: this.knex,
            schema: this.schema,
        });
    }
    async processAST(ast, action = 'read') {
        var _a, _b, _c;
        const collectionsRequested = getCollectionsFromAST(ast);
        const permissionsForCollections = (_c = (0, lodash_1.uniqWith)((_b = (_a = this.accountability) === null || _a === void 0 ? void 0 : _a.permissions) === null || _b === void 0 ? void 0 : _b.filter((permission) => {
            return (permission.action === action &&
                collectionsRequested.map(({ collection }) => collection).includes(permission.collection));
        }), (curr, prev) => curr.collection === prev.collection && curr.action === prev.action && curr.role === prev.role)) !== null && _c !== void 0 ? _c : [];
        // If the permissions don't match the collections, you don't have permission to read all of them
        const uniqueCollectionsRequestedCount = (0, lodash_1.uniq)(collectionsRequested.map(({ collection }) => collection)).length;
        if (uniqueCollectionsRequestedCount !== permissionsForCollections.length) {
            throw new exceptions_1.ForbiddenException();
        }
        validateFields(ast);
        applyFilters(ast, this.accountability);
        return ast;
        /**
         * Traverses the AST and returns an array of all collections that are being fetched
         */
        function getCollectionsFromAST(ast) {
            const collections = [];
            if (ast.type === 'a2o') {
                collections.push(...ast.names.map((name) => ({ collection: name, field: ast.fieldKey })));
                for (const children of Object.values(ast.children)) {
                    for (const nestedNode of children) {
                        if (nestedNode.type !== 'field') {
                            collections.push(...getCollectionsFromAST(nestedNode));
                        }
                    }
                }
            }
            else {
                collections.push({
                    collection: ast.name,
                    field: ast.type === 'root' ? null : ast.fieldKey,
                });
                for (const nestedNode of ast.children) {
                    if (nestedNode.type !== 'field') {
                        collections.push(...getCollectionsFromAST(nestedNode));
                    }
                }
            }
            return collections;
        }
        function validateFields(ast) {
            var _a, _b, _c;
            if (ast.type !== 'field') {
                if (ast.type === 'a2o') {
                    for (const [collection, children] of Object.entries(ast.children)) {
                        checkFields(collection, children, (_b = (_a = ast.query) === null || _a === void 0 ? void 0 : _a[collection]) === null || _b === void 0 ? void 0 : _b.aggregate);
                    }
                }
                else {
                    checkFields(ast.name, ast.children, (_c = ast.query) === null || _c === void 0 ? void 0 : _c.aggregate);
                }
            }
            function checkFields(collection, children, aggregate) {
                // We check the availability of the permissions in the step before this is run
                const permissions = permissionsForCollections.find((permission) => permission.collection === collection);
                const allowedFields = permissions.fields || [];
                if (aggregate && allowedFields.includes('*') === false) {
                    for (const aliasMap of Object.values(aggregate)) {
                        if (!aliasMap)
                            continue;
                        for (const column of Object.values(aliasMap)) {
                            if (allowedFields.includes(column) === false)
                                throw new exceptions_1.ForbiddenException();
                        }
                    }
                }
                for (const childNode of children) {
                    if (childNode.type !== 'field') {
                        validateFields(childNode);
                        continue;
                    }
                    if (allowedFields.includes('*'))
                        continue;
                    const fieldKey = childNode.name;
                    if (allowedFields.includes(fieldKey) === false) {
                        throw new exceptions_1.ForbiddenException();
                    }
                }
            }
        }
        function applyFilters(ast, accountability) {
            if (ast.type !== 'field') {
                if (ast.type === 'a2o') {
                    const collections = Object.keys(ast.children);
                    for (const collection of collections) {
                        updateFilterQuery(collection, ast.query[collection]);
                    }
                    for (const [collection, children] of Object.entries(ast.children)) {
                        ast.children[collection] = children.map((child) => applyFilters(child, accountability));
                    }
                }
                else {
                    const collection = ast.name;
                    updateFilterQuery(collection, ast.query);
                    ast.children = ast.children.map((child) => applyFilters(child, accountability));
                }
            }
            return ast;
            function updateFilterQuery(collection, query) {
                // We check the availability of the permissions in the step before this is run
                const permissions = permissionsForCollections.find((permission) => permission.collection === collection);
                if (!query.filter || Object.keys(query.filter).length === 0) {
                    query.filter = { _and: [] };
                }
                else {
                    query.filter = { _and: [query.filter] };
                }
                if (permissions.permissions && Object.keys(permissions.permissions).length > 0) {
                    query.filter._and.push(permissions.permissions);
                }
                if (query.filter._and.length === 0)
                    delete query.filter;
            }
        }
    }
    /**
     * Checks if the provided payload matches the configured permissions, and adds the presets to the payload.
     */
    validatePayload(action, collection, data) {
        var _a, _b, _c, _d, _e, _f, _g;
        const payload = (0, lodash_1.cloneDeep)(data);
        let permission;
        if (((_a = this.accountability) === null || _a === void 0 ? void 0 : _a.admin) === true) {
            permission = {
                id: 0,
                role: (_b = this.accountability) === null || _b === void 0 ? void 0 : _b.role,
                collection,
                action,
                permissions: {},
                validation: {},
                fields: ['*'],
                presets: {},
            };
        }
        else {
            permission = (_d = (_c = this.accountability) === null || _c === void 0 ? void 0 : _c.permissions) === null || _d === void 0 ? void 0 : _d.find((permission) => {
                return permission.collection === collection && permission.action === action;
            });
            if (!permission)
                throw new exceptions_1.ForbiddenException();
            // Check if you have permission to access the fields you're trying to access
            const allowedFields = permission.fields || [];
            if (allowedFields.includes('*') === false) {
                const keysInData = Object.keys(payload);
                const invalidKeys = keysInData.filter((fieldKey) => allowedFields.includes(fieldKey) === false);
                if (invalidKeys.length > 0) {
                    throw new exceptions_1.ForbiddenException();
                }
            }
        }
        const preset = (_e = permission.presets) !== null && _e !== void 0 ? _e : {};
        const payloadWithPresets = (0, lodash_1.merge)({}, preset, payload);
        const hasValidationRules = (0, lodash_1.isNil)(permission.validation) === false && Object.keys((_f = permission.validation) !== null && _f !== void 0 ? _f : {}).length > 0;
        const requiredColumns = [];
        for (const field of Object.values(this.schema.collections[collection].fields)) {
            const specials = (_g = field === null || field === void 0 ? void 0 : field.special) !== null && _g !== void 0 ? _g : [];
            const hasGenerateSpecial = ['uuid', 'date-created', 'role-created', 'user-created'].some((name) => specials.includes(name));
            const nullable = field.nullable || hasGenerateSpecial || field.generated;
            if (!nullable) {
                requiredColumns.push(field);
            }
        }
        if (hasValidationRules === false && requiredColumns.length === 0) {
            return payloadWithPresets;
        }
        if (requiredColumns.length > 0) {
            permission.validation = hasValidationRules ? { _and: [permission.validation] } : { _and: [] };
            for (const field of requiredColumns) {
                if (action === 'create' && field.defaultValue === null) {
                    permission.validation._and.push({
                        [field.field]: {
                            _submitted: true,
                        },
                    });
                }
                permission.validation._and.push({
                    [field.field]: {
                        _nnull: true,
                    },
                });
            }
        }
        const validationErrors = [];
        validationErrors.push(...(0, lodash_1.flatten)((0, utils_1.validatePayload)(permission.validation, payloadWithPresets).map((error) => error.details.map((details) => new exceptions_2.FailedValidationException(details)))));
        if (validationErrors.length > 0)
            throw validationErrors;
        return payloadWithPresets;
    }
    async checkAccess(action, collection, pk) {
        var _a;
        if (((_a = this.accountability) === null || _a === void 0 ? void 0 : _a.admin) === true)
            return;
        const itemsService = new items_1.ItemsService(collection, {
            accountability: this.accountability,
            knex: this.knex,
            schema: this.schema,
        });
        const query = {
            fields: ['*'],
        };
        if (Array.isArray(pk)) {
            const result = await itemsService.readMany(pk, { ...query, limit: pk.length }, { permissionsAction: action });
            if (!result)
                throw new exceptions_1.ForbiddenException();
            if (result.length !== pk.length)
                throw new exceptions_1.ForbiddenException();
        }
        else {
            const result = await itemsService.readOne(pk, query, { permissionsAction: action });
            if (!result)
                throw new exceptions_1.ForbiddenException();
        }
    }
}
exports.AuthorizationService = AuthorizationService;
