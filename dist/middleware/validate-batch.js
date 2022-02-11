"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBatch = void 0;
const joi_1 = __importDefault(require("joi"));
const exceptions_1 = require("../exceptions");
const exceptions_2 = require("@directus/shared/exceptions");
const async_handler_1 = __importDefault(require("../utils/async-handler"));
const sanitize_query_1 = require("../utils/sanitize-query");
const validateBatch = (scope) => (0, async_handler_1.default)(async (req, res, next) => {
    if (req.method.toLowerCase() === 'get') {
        req.body = {};
        return next();
    }
    if (!req.body)
        throw new exceptions_1.InvalidPayloadException('Payload in body is required');
    if (req.singleton)
        return next();
    // Every cRUD action has either keys or query
    let batchSchema = joi_1.default.object().keys({
        keys: joi_1.default.array().items(joi_1.default.alternatives(joi_1.default.string(), joi_1.default.number())),
        query: joi_1.default.object().unknown(),
    });
    // In reads, you can't combine the two, and 1 of the two at  least is required
    if (scope !== 'read') {
        batchSchema = batchSchema.xor('query', 'keys');
    }
    // In updates, we add a required `data` that holds the update payload
    if (scope === 'update') {
        batchSchema = batchSchema.keys({
            data: joi_1.default.object().unknown().required(),
        });
    }
    // In deletes, we want to keep supporting an array of just primary keys
    if (scope === 'delete' && Array.isArray(req.body)) {
        return next();
    }
    const { error } = batchSchema.validate(req.body);
    if (error) {
        throw new exceptions_2.FailedValidationException(error.details[0]);
    }
    // In reads, the query in the body should override the query params for searching
    if (scope === 'read' && req.body.query) {
        req.sanitizedQuery = (0, sanitize_query_1.sanitizeQuery)(req.body.query, req.accountability);
    }
    return next();
});
exports.validateBatch = validateBatch;
