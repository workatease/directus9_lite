"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionsService = void 0;
const app_access_permissions_1 = require("../database/system-data/app-access-permissions");
const items_1 = require("../services/items");
const filter_items_1 = require("../utils/filter-items");
const cache_1 = require("../cache");
class PermissionsService extends items_1.ItemsService {
    constructor(options) {
        super('directus_permissions', options);
        const { systemCache } = (0, cache_1.getCache)();
        this.systemCache = systemCache;
    }
    getAllowedFields(action, collection) {
        var _a, _b, _c;
        const results = (_c = (_b = (_a = this.accountability) === null || _a === void 0 ? void 0 : _a.permissions) === null || _b === void 0 ? void 0 : _b.filter((permission) => {
            let matchesCollection = true;
            if (collection) {
                matchesCollection = permission.collection === collection;
            }
            const matchesAction = permission.action === action;
            return collection ? matchesCollection && matchesAction : matchesAction;
        })) !== null && _c !== void 0 ? _c : [];
        const fieldsPerCollection = {};
        for (const result of results) {
            const { collection, fields } = result;
            if (!fieldsPerCollection[collection])
                fieldsPerCollection[collection] = [];
            fieldsPerCollection[collection].push(...(fields !== null && fields !== void 0 ? fields : []));
        }
        return fieldsPerCollection;
    }
    async readByQuery(query, opts) {
        const result = await super.readByQuery(query, opts);
        if (Array.isArray(result) && this.accountability && this.accountability.app === true) {
            result.push(...(0, filter_items_1.filterItems)(app_access_permissions_1.appAccessMinimalPermissions.map((permission) => ({
                ...permission,
                role: this.accountability.role,
            })), query.filter));
        }
        return result;
    }
    async readMany(keys, query = {}, opts) {
        const result = await super.readMany(keys, query, opts);
        if (this.accountability && this.accountability.app === true) {
            result.push(...(0, filter_items_1.filterItems)(app_access_permissions_1.appAccessMinimalPermissions.map((permission) => ({
                ...permission,
                role: this.accountability.role,
            })), query.filter));
        }
        return result;
    }
    async createOne(data, opts) {
        const res = await super.createOne(data, opts);
        await this.systemCache.clear();
        return res;
    }
    async createMany(data, opts) {
        const res = await super.createMany(data, opts);
        await this.systemCache.clear();
        return res;
    }
    async updateByQuery(query, data, opts) {
        const res = await super.updateByQuery(query, data, opts);
        await this.systemCache.clear();
        return res;
    }
    async updateOne(key, data, opts) {
        const res = await super.updateOne(key, data, opts);
        await this.systemCache.clear();
        return res;
    }
    async updateMany(keys, data, opts) {
        const res = await super.updateMany(keys, data, opts);
        await this.systemCache.clear();
        return res;
    }
    async upsertOne(payload, opts) {
        const res = await super.upsertOne(payload, opts);
        await this.systemCache.clear();
        return res;
    }
    async upsertMany(payloads, opts) {
        const res = await super.upsertMany(payloads, opts);
        await this.systemCache.clear();
        return res;
    }
    async deleteByQuery(query, opts) {
        const res = await super.deleteByQuery(query, opts);
        await this.systemCache.clear();
        return res;
    }
    async deleteOne(key, opts) {
        const res = await super.deleteOne(key, opts);
        await this.systemCache.clear();
        return res;
    }
    async deleteMany(keys, opts) {
        const res = await super.deleteMany(keys, opts);
        await this.systemCache.clear();
        return res;
    }
}
exports.PermissionsService = PermissionsService;
