"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.COOKIE_OPTIONS = exports.UUID_REGEX = exports.COLUMN_TRANSFORMS = exports.DEFAULT_AUTH_PROVIDER = exports.ALIAS_TYPES = exports.FILTER_VARIABLES = exports.ASSET_TRANSFORM_QUERY_KEYS = void 0;
const env_1 = __importDefault(require("./env"));
const ms_1 = __importDefault(require("ms"));
exports.ASSET_TRANSFORM_QUERY_KEYS = [
    'key',
    'transforms',
    'width',
    'height',
    'format',
    'fit',
    'quality',
    'withoutEnlargement',
];
exports.FILTER_VARIABLES = ['$NOW', '$CURRENT_USER', '$CURRENT_ROLE'];
exports.ALIAS_TYPES = ['alias', 'o2m', 'm2m', 'm2a', 'o2a', 'files', 'translations'];
exports.DEFAULT_AUTH_PROVIDER = 'default';
exports.COLUMN_TRANSFORMS = ['year', 'month', 'day', 'weekday', 'hour', 'minute', 'second'];
exports.UUID_REGEX = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
exports.COOKIE_OPTIONS = {
    httpOnly: true,
    domain: env_1.default.REFRESH_TOKEN_COOKIE_DOMAIN,
    maxAge: (0, ms_1.default)(env_1.default.REFRESH_TOKEN_TTL),
    secure: (_a = env_1.default.REFRESH_TOKEN_COOKIE_SECURE) !== null && _a !== void 0 ? _a : false,
    sameSite: env_1.default.REFRESH_TOKEN_COOKIE_SAME_SITE || 'strict',
};
