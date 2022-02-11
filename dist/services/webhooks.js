"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhooksService = void 0;
const webhooks_1 = require("../webhooks");
const items_1 = require("./items");
class WebhooksService extends items_1.ItemsService {
    constructor(options) {
        super('directus_webhooks', options);
    }
    async createOne(data, opts) {
        const result = await super.createOne(data, opts);
        await (0, webhooks_1.register)();
        return result;
    }
    async createMany(data, opts) {
        const result = await super.createMany(data, opts);
        await (0, webhooks_1.register)();
        return result;
    }
    async updateOne(key, data, opts) {
        const result = await super.updateOne(key, data, opts);
        await (0, webhooks_1.register)();
        return result;
    }
    async updateMany(keys, data, opts) {
        const result = await super.updateMany(keys, data, opts);
        await (0, webhooks_1.register)();
        return result;
    }
    async deleteOne(key, opts) {
        const result = await super.deleteOne(key, opts);
        await (0, webhooks_1.register)();
        return result;
    }
    async deleteMany(keys, opts) {
        const result = await super.deleteMany(keys, opts);
        await (0, webhooks_1.register)();
        return result;
    }
}
exports.WebhooksService = WebhooksService;
