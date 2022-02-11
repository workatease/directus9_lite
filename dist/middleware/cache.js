"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cache_1 = require("../cache");
const env_1 = __importDefault(require("../env"));
const async_handler_1 = __importDefault(require("../utils/async-handler"));
const get_cache_headers_1 = require("../utils/get-cache-headers");
const get_cache_key_1 = require("../utils/get-cache-key");
const logger_1 = __importDefault(require("../logger"));
const checkCacheMiddleware = (0, async_handler_1.default)(async (req, res, next) => {
    var _a, _b;
    const { cache } = (0, cache_1.getCache)();
    if (req.method.toLowerCase() !== 'get')
        return next();
    if (env_1.default.CACHE_ENABLED !== true)
        return next();
    if (!cache)
        return next();
    if (((_a = req.headers['cache-control']) === null || _a === void 0 ? void 0 : _a.includes('no-store')) || ((_b = req.headers['Cache-Control']) === null || _b === void 0 ? void 0 : _b.includes('no-store'))) {
        return next();
    }
    const key = (0, get_cache_key_1.getCacheKey)(req);
    let cachedData;
    try {
        cachedData = await cache.get(key);
    }
    catch (err) {
        logger_1.default.warn(err, `[cache] Couldn't read key ${key}. ${err.message}`);
        return next();
    }
    if (cachedData) {
        let cacheExpiryDate;
        try {
            cacheExpiryDate = (await cache.get(`${key}__expires_at`));
        }
        catch (err) {
            logger_1.default.warn(err, `[cache] Couldn't read key ${`${key}__expires_at`}. ${err.message}`);
            return next();
        }
        const cacheTTL = cacheExpiryDate ? cacheExpiryDate - Date.now() : null;
        res.setHeader('Cache-Control', (0, get_cache_headers_1.getCacheControlHeader)(req, cacheTTL));
        res.setHeader('Vary', 'Origin, Cache-Control');
        return res.json(cachedData);
    }
    else {
        return next();
    }
});
exports.default = checkCacheMiddleware;
