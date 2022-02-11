"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.track = void 0;
const axios_1 = __importDefault(require("axios"));
const ms_1 = __importDefault(require("ms"));
const node_machine_id_1 = require("node-machine-id");
const os_1 = __importDefault(require("os"));
// @ts-ignore
const package_json_1 = require("../../package.json");
const env_1 = __importDefault(require("../env"));
const logger_1 = __importDefault(require("../logger"));
async function track(event) {
    if (env_1.default.TELEMETRY !== false) {
        const info = await getEnvInfo(event);
        try {
            await axios_1.default.post('https://telemetry.directus.io/', info);
        }
        catch (err) {
            if (env_1.default.NODE_ENV === 'development') {
                logger_1.default.error(err);
            }
        }
    }
}
exports.track = track;
async function getEnvInfo(event) {
    return {
        version: package_json_1.version,
        event: event,
        project_id: env_1.default.KEY,
        machine_id: await (0, node_machine_id_1.machineId)(),
        environment: env_1.default.NODE_ENV,
        stack: 'node',
        os: {
            arch: os_1.default.arch(),
            platform: os_1.default.platform(),
            release: os_1.default.release(),
        },
        rate_limiter: {
            enabled: env_1.default.RATE_LIMITER_ENABLED,
            points: +env_1.default.RATE_LIMITER_POINTS,
            duration: +env_1.default.RATE_LIMITER_DURATION,
            store: env_1.default.RATE_LIMITER_STORE,
        },
        cache: {
            enabled: env_1.default.CACHE_ENABLED,
            ttl: (0, ms_1.default)(env_1.default.CACHE_TTL),
            store: env_1.default.CACHE_STORE,
        },
        storage: {
            drivers: getStorageDrivers(),
        },
        cors: {
            enabled: env_1.default.CORS_ENABLED,
        },
        email: {
            transport: env_1.default.EMAIL_TRANSPORT,
        },
        auth: {
            providers: env_1.default.AUTH_PROVIDERS.split(',')
                .map((v) => v.trim())
                .filter((v) => v),
        },
        db_client: env_1.default.DB_CLIENT,
    };
}
function getStorageDrivers() {
    const drivers = [];
    const locations = env_1.default.STORAGE_LOCATIONS.split(',')
        .map((v) => v.trim())
        .filter((v) => v);
    for (const location of locations) {
        const driver = env_1.default[`STORAGE_${location.toUpperCase()}_DRIVER`];
        drivers.push(driver);
    }
    return drivers;
}
