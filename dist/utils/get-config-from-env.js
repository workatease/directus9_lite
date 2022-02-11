"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfigFromEnv = void 0;
const camelcase_1 = __importDefault(require("camelcase"));
const lodash_1 = require("lodash");
const env_1 = __importDefault(require("../env"));
function getConfigFromEnv(prefix, omitPrefix, type = 'camelcase') {
    const config = {};
    for (const [key, value] of Object.entries(env_1.default)) {
        if (key.toLowerCase().startsWith(prefix.toLowerCase()) === false)
            continue;
        if (omitPrefix) {
            let matches = false;
            if (Array.isArray(omitPrefix)) {
                matches = omitPrefix.some((prefix) => key.toLowerCase().startsWith(prefix.toLowerCase()));
            }
            else {
                matches = key.toLowerCase().startsWith(omitPrefix.toLowerCase());
            }
            if (matches)
                continue;
        }
        if (key.includes('__')) {
            const path = key
                .split('__')
                .map((key, index) => (index === 0 ? transform(transform(key.slice(prefix.length))) : transform(key)));
            (0, lodash_1.set)(config, path.join('.'), value);
        }
        else {
            config[transform(key.slice(prefix.length))] = value;
        }
    }
    return config;
    function transform(key) {
        if (type === 'camelcase') {
            return (0, camelcase_1.default)(key);
        }
        else if (type === 'underscore') {
            return key.toLowerCase();
        }
        return key;
    }
}
exports.getConfigFromEnv = getConfigFromEnv;
