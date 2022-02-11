"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const nanoid_1 = require("nanoid");
const run_1 = __importDefault(require("../../../database/migrations/run"));
const run_2 = __importDefault(require("../../../database/seeds/run"));
const env_1 = __importDefault(require("../../../env"));
const logger_1 = __importDefault(require("../../../logger"));
const get_schema_1 = require("../../../utils/get-schema");
const services_1 = require("../../../services");
const database_1 = __importStar(require("../../../database"));
const defaults_1 = require("../../utils/defaults");
async function bootstrap({ skipAdminInit }) {
    logger_1.default.info('Initializing bootstrap...');
    const database = (0, database_1.default)();
    await waitForDatabase(database);
    if ((await (0, database_1.isInstalled)()) === false) {
        logger_1.default.info('Installing Directus system tables...');
        await (0, run_2.default)(database);
        logger_1.default.info('Running migrations...');
        await (0, run_1.default)(database, 'latest');
        const schema = await (0, get_schema_1.getSchema)();
        if (skipAdminInit == null) {
            await createDefaultAdmin(schema);
        }
        else {
            logger_1.default.info('Skipping creation of default Admin user and role...');
        }
        if (env_1.default.PROJECT_NAME && typeof env_1.default.PROJECT_NAME === 'string' && env_1.default.PROJECT_NAME.length > 0) {
            const settingsService = new services_1.SettingsService({ schema });
            await settingsService.upsertSingleton({ project_name: env_1.default.PROJECT_NAME });
        }
    }
    else {
        logger_1.default.info('Database already initialized, skipping install');
        logger_1.default.info('Running migrations...');
        await (0, run_1.default)(database, 'latest');
    }
    logger_1.default.info('Done');
    process.exit(0);
}
exports.default = bootstrap;
async function waitForDatabase(database) {
    const tries = 5;
    const secondsBetweenTries = 5;
    for (let i = 0; i < tries; i++) {
        if (await (0, database_1.hasDatabaseConnection)(database)) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, secondsBetweenTries * 1000));
    }
    // This will throw and exit the process if the database is not available
    await (0, database_1.validateDatabaseConnection)(database);
}
async function createDefaultAdmin(schema) {
    logger_1.default.info('Setting up first admin role...');
    const rolesService = new services_1.RolesService({ schema });
    const role = await rolesService.createOne(defaults_1.defaultAdminRole);
    logger_1.default.info('Adding first admin user...');
    const usersService = new services_1.UsersService({ schema });
    let adminEmail = env_1.default.ADMIN_EMAIL;
    if (!adminEmail) {
        logger_1.default.info('No admin email provided. Defaulting to "admin@example.com"');
        adminEmail = 'admin@example.com';
    }
    let adminPassword = env_1.default.ADMIN_PASSWORD;
    if (!adminPassword) {
        adminPassword = (0, nanoid_1.nanoid)(12);
        logger_1.default.info(`No admin password provided. Defaulting to "${adminPassword}"`);
    }
    await usersService.createOne({ email: adminEmail, password: adminPassword, role, ...defaults_1.defaultAdminUser });
}
