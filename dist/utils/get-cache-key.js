"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCacheKey = void 0;
const url_1 = __importDefault(require("url"));
const object_hash_1 = __importDefault(require("object-hash"));
const lodash_1 = require("lodash");
function getCacheKey(req) {
    var _a;
    const path = url_1.default.parse(req.originalUrl).pathname;
    const isGraphQl = path === null || path === void 0 ? void 0 : path.includes('/graphql');
    const info = {
        user: ((_a = req.accountability) === null || _a === void 0 ? void 0 : _a.user) || null,
        path,
        query: isGraphQl ? (0, lodash_1.pick)(req.query, ['query', 'variables']) : req.sanitizedQuery,
    };
    const key = (0, object_hash_1.default)(info);
    return key;
}
exports.getCacheKey = getCacheKey;
