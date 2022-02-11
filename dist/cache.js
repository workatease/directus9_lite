"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.flushCaches = exports.getCache = void 0;
const keyv_1 = __importDefault(require("keyv"));
const ms_1 = __importDefault(require("ms"));
const env_1 = __importDefault(require("./env"));
const logger_1 = __importDefault(require("./logger"));
const get_config_from_env_1 = require("./utils/get-config-from-env");
const validate_env_1 = require("./utils/validate-env");
let cache = null;
let systemCache = null;
function getCache() {
    if (env_1.default.CACHE_ENABLED === true && cache === null) {
        (0, validate_env_1.validateEnv)(['CACHE_NAMESPACE', 'CACHE_TTL', 'CACHE_STORE']);
        cache = getKeyvInstance((0, ms_1.default)(env_1.default.CACHE_TTL));
        cache.on('error', (err) => logger_1.default.warn(err, `[cache] ${err}`));
    }
    if (systemCache === null) {
        systemCache = getKeyvInstance(undefined, '_system');
        systemCache.on('error', (err) => logger_1.default.warn(err, `[cache] ${err}`));
    }
    return { cache, systemCache };
}
exports.getCache = getCache;
async function flushCaches() {
    const { systemCache, cache } = getCache();
    await (systemCache === null || systemCache === void 0 ? void 0 : systemCache.clear());
    await (cache === null || cache === void 0 ? void 0 : cache.clear());
}
exports.flushCaches = flushCaches;
function getKeyvInstance(ttl, namespaceSuffix) {
    switch (env_1.default.CACHE_STORE) {
        case 'redis':
            return new keyv_1.default(getConfig('redis', ttl, namespaceSuffix));
        case 'memcache':
            return new keyv_1.default(getConfig('memcache', ttl, namespaceSuffix));
        case 'memory':
        default:
            return new keyv_1.default(getConfig('memory', ttl, namespaceSuffix));
    }
}
function getConfig(store = 'memory', ttl, namespaceSuffix = '') {
    const config = {
        namespace: `${env_1.default.CACHE_NAMESPACE}${namespaceSuffix}`,
        ttl,
    };
    if (store === 'redis') {
        const KeyvRedis = require('@keyv/redis');
        config.store = new KeyvRedis(env_1.default.CACHE_REDIS || (0, get_config_from_env_1.getConfigFromEnv)('CACHE_REDIS_'));
    }
    if (store === 'memcache') {
        const KeyvMemcache = require('keyv-memcache');
        // keyv-memcache uses memjs which only accepts a comma separated string instead of an array,
        // so we need to join array into a string when applicable. See #7986
        const cacheMemcache = Array.isArray(env_1.default.CACHE_MEMCACHE) ? env_1.default.CACHE_MEMCACHE.join(',') : env_1.default.CACHE_MEMCACHE;
        config.store = new KeyvMemcache(cacheMemcache);
    }
    return config;
}
