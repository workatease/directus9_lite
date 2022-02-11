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
exports.getExtensionManager = void 0;
const express_1 = __importStar(require("express"));
const path_1 = __importDefault(require("path"));
const node_1 = require("@directus/shared/utils/node");
const constants_1 = require("@directus/shared/constants");
const database_1 = __importDefault(require("./database"));
const emitter_1 = __importStar(require("./emitter"));
const env_1 = __importDefault(require("./env"));
const exceptions = __importStar(require("./exceptions"));
const sharedExceptions = __importStar(require("@directus/shared/exceptions"));
const logger_1 = __importDefault(require("./logger"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const get_schema_1 = require("./utils/get-schema");
const services = __importStar(require("./services"));
const node_cron_1 = require("node-cron");
const rollup_1 = require("rollup");
// @TODO Remove this once a new version of @rollup/plugin-virtual has been released
// @ts-expect-error
const plugin_virtual_1 = __importDefault(require("@rollup/plugin-virtual"));
const plugin_alias_1 = __importDefault(require("@rollup/plugin-alias"));
const url_1 = require("./utils/url");
const get_module_default_1 = __importDefault(require("./utils/get-module-default"));
const lodash_1 = require("lodash");
const chokidar_1 = __importDefault(require("chokidar"));
const utils_1 = require("@directus/shared/utils");
let extensionManager;
function getExtensionManager() {
    if (extensionManager) {
        return extensionManager;
    }
    extensionManager = new ExtensionManager();
    return extensionManager;
}
exports.getExtensionManager = getExtensionManager;
const defaultOptions = {
    schedule: true,
    watch: env_1.default.EXTENSIONS_AUTO_RELOAD && env_1.default.NODE_ENV !== 'development',
};
class ExtensionManager {
    constructor() {
        this.isLoaded = false;
        this.extensions = [];
        this.appExtensions = {};
        this.apiExtensions = { hooks: [], endpoints: [] };
        this.watcher = null;
        this.options = defaultOptions;
        this.apiEmitter = new emitter_1.Emitter();
        this.endpointRouter = (0, express_1.Router)();
    }
    async initialize(options = {}) {
        this.options = {
            ...defaultOptions,
            ...options,
        };
        this.initializeWatcher();
        if (!this.isLoaded) {
            await this.load();
            this.updateWatchedExtensions(this.extensions);
            const loadedExtensions = this.getExtensionsList();
            if (loadedExtensions.length > 0) {
                logger_1.default.info(`Loaded extensions: ${loadedExtensions.join(', ')}`);
            }
        }
    }
    async reload() {
        if (this.isLoaded) {
            logger_1.default.info('Reloading extensions');
            const prevExtensions = (0, lodash_1.clone)(this.extensions);
            await this.unload();
            await this.load();
            const added = this.extensions.filter((extension) => !prevExtensions.some((prevExtension) => extension.path === prevExtension.path));
            const removed = prevExtensions.filter((prevExtension) => !this.extensions.some((extension) => prevExtension.path === extension.path));
            this.updateWatchedExtensions(added, removed);
            const addedExtensions = added.map((extension) => extension.name);
            const removedExtensions = removed.map((extension) => extension.name);
            if (addedExtensions.length > 0) {
                logger_1.default.info(`Added extensions: ${addedExtensions.join(', ')}`);
            }
            if (removedExtensions.length > 0) {
                logger_1.default.info(`Removed extensions: ${removedExtensions.join(', ')}`);
            }
        }
        else {
            logger_1.default.warn('Extensions have to be loaded before they can be reloaded');
        }
    }
    getExtensionsList(type) {
        if (type === undefined) {
            return this.extensions.map((extension) => extension.name);
        }
        else {
            return this.extensions.filter((extension) => extension.type === type).map((extension) => extension.name);
        }
    }
    getAppExtensions(type) {
        return this.appExtensions[type];
    }
    getEndpointRouter() {
        return this.endpointRouter;
    }
    async load() {
        try {
            await (0, node_1.ensureExtensionDirs)(env_1.default.EXTENSIONS_PATH, env_1.default.SERVE_APP ? constants_1.EXTENSION_TYPES : constants_1.API_EXTENSION_TYPES);
            this.extensions = await this.getExtensions();
        }
        catch (err) {
            logger_1.default.warn(`Couldn't load extensions`);
            logger_1.default.warn(err);
        }
        this.registerHooks();
        this.registerEndpoints();
        if (env_1.default.SERVE_APP) {
            this.appExtensions = await this.generateExtensionBundles();
        }
        this.isLoaded = true;
    }
    async unload() {
        this.unregisterHooks();
        this.unregisterEndpoints();
        this.apiEmitter.offAll();
        if (env_1.default.SERVE_APP) {
            this.appExtensions = {};
        }
        this.isLoaded = false;
    }
    initializeWatcher() {
        if (this.options.watch && !this.watcher) {
            logger_1.default.info('Watching extensions for changes...');
            const localExtensionPaths = (env_1.default.SERVE_APP ? constants_1.EXTENSION_TYPES : constants_1.API_EXTENSION_TYPES).map((type) => path_1.default.posix.join(path_1.default.relative('.', env_1.default.EXTENSIONS_PATH).split(path_1.default.sep).join(path_1.default.posix.sep), (0, utils_1.pluralize)(type), '*', 'index.js'));
            this.watcher = chokidar_1.default.watch([path_1.default.resolve('.', 'package.json'), ...localExtensionPaths], {
                ignoreInitial: true,
            });
            this.watcher
                .on('add', () => this.reload())
                .on('change', () => this.reload())
                .on('unlink', () => this.reload());
        }
    }
    updateWatchedExtensions(added, removed = []) {
        if (this.watcher) {
            const toPackageExtensionPaths = (extensions) => extensions
                .filter((extension) => !extension.local)
                .map((extension) => extension.type !== 'pack'
                ? path_1.default.resolve(extension.path, extension.entrypoint || '')
                : path_1.default.resolve(extension.path, 'package.json'));
            const addedPackageExtensionPaths = toPackageExtensionPaths(added);
            const removedPackageExtensionPaths = toPackageExtensionPaths(removed);
            this.watcher.add(addedPackageExtensionPaths);
            this.watcher.unwatch(removedPackageExtensionPaths);
        }
    }
    async getExtensions() {
        const packageExtensions = await (0, node_1.getPackageExtensions)('.', env_1.default.SERVE_APP ? constants_1.EXTENSION_PACKAGE_TYPES : constants_1.API_EXTENSION_PACKAGE_TYPES);
        const localExtensions = await (0, node_1.getLocalExtensions)(env_1.default.EXTENSIONS_PATH, env_1.default.SERVE_APP ? constants_1.EXTENSION_TYPES : constants_1.API_EXTENSION_TYPES);
        return [...packageExtensions, ...localExtensions];
    }
    async generateExtensionBundles() {
        const sharedDepsMapping = await this.getSharedDepsMapping(constants_1.APP_SHARED_DEPS);
        const internalImports = Object.entries(sharedDepsMapping).map(([name, path]) => ({
            find: name,
            replacement: path,
        }));
        const bundles = {};
        for (const extensionType of constants_1.APP_EXTENSION_TYPES) {
            const entry = (0, node_1.generateExtensionsEntry)(extensionType, this.extensions);
            try {
                const bundle = await (0, rollup_1.rollup)({
                    input: 'entry',
                    external: Object.values(sharedDepsMapping),
                    makeAbsoluteExternalsRelative: false,
                    plugins: [(0, plugin_virtual_1.default)({ entry }), (0, plugin_alias_1.default)({ entries: internalImports })],
                });
                const { output } = await bundle.generate({ format: 'es', compact: true });
                bundles[extensionType] = output[0].code;
                await bundle.close();
            }
            catch (error) {
                logger_1.default.warn(`Couldn't bundle App extensions`);
                logger_1.default.warn(error);
            }
        }
        return bundles;
    }
    async getSharedDepsMapping(deps) {
        const appDir = await fs_extra_1.default.readdir(path_1.default.join((0, node_1.resolvePackage)('@directus/app'), 'dist', 'assets'));
        const depsMapping = {};
        for (const dep of deps) {
            const depRegex = new RegExp(`${(0, lodash_1.escapeRegExp)(dep.replace(/\//g, '_'))}\\.[0-9a-f]{8}\\.entry\\.js`);
            const depName = appDir.find((file) => depRegex.test(file));
            if (depName) {
                const depUrl = new url_1.Url(env_1.default.PUBLIC_URL).addPath('admin', 'assets', depName);
                depsMapping[dep] = depUrl.toString({ rootRelative: true });
            }
            else {
                logger_1.default.warn(`Couldn't find shared extension dependency "${dep}"`);
            }
        }
        return depsMapping;
    }
    registerHooks() {
        const hooks = this.extensions.filter((extension) => extension.type === 'hook');
        for (const hook of hooks) {
            try {
                this.registerHook(hook);
            }
            catch (error) {
                logger_1.default.warn(`Couldn't register hook "${hook.name}"`);
                logger_1.default.warn(error);
            }
        }
    }
    registerEndpoints() {
        const endpoints = this.extensions.filter((extension) => extension.type === 'endpoint');
        for (const endpoint of endpoints) {
            try {
                this.registerEndpoint(endpoint, this.endpointRouter);
            }
            catch (error) {
                logger_1.default.warn(`Couldn't register endpoint "${endpoint.name}"`);
                logger_1.default.warn(error);
            }
        }
    }
    registerHook(hook) {
        const hookPath = path_1.default.resolve(hook.path, hook.entrypoint || '');
        const hookInstance = require(hookPath);
        const register = (0, get_module_default_1.default)(hookInstance);
        const hookHandler = {
            path: hookPath,
            events: [],
        };
        const registerFunctions = {
            filter: (event, handler) => {
                emitter_1.default.onFilter(event, handler);
                hookHandler.events.push({
                    type: 'filter',
                    name: event,
                    handler,
                });
            },
            action: (event, handler) => {
                emitter_1.default.onAction(event, handler);
                hookHandler.events.push({
                    type: 'action',
                    name: event,
                    handler,
                });
            },
            init: (event, handler) => {
                emitter_1.default.onInit(event, handler);
                hookHandler.events.push({
                    type: 'init',
                    name: event,
                    handler,
                });
            },
            schedule: (cron, handler) => {
                if ((0, node_cron_1.validate)(cron)) {
                    const task = (0, node_cron_1.schedule)(cron, async () => {
                        if (this.options.schedule) {
                            try {
                                await handler();
                            }
                            catch (error) {
                                logger_1.default.error(error);
                            }
                        }
                    });
                    hookHandler.events.push({
                        type: 'schedule',
                        task,
                    });
                }
                else {
                    logger_1.default.warn(`Couldn't register cron hook. Provided cron is invalid: ${cron}`);
                }
            },
        };
        register(registerFunctions, {
            services,
            exceptions: { ...exceptions, ...sharedExceptions },
            env: env_1.default,
            database: (0, database_1.default)(),
            emitter: this.apiEmitter,
            logger: logger_1.default,
            getSchema: get_schema_1.getSchema,
        });
        this.apiExtensions.hooks.push(hookHandler);
    }
    registerEndpoint(endpoint, router) {
        const endpointPath = path_1.default.resolve(endpoint.path, endpoint.entrypoint || '');
        const endpointInstance = require(endpointPath);
        const mod = (0, get_module_default_1.default)(endpointInstance);
        const register = typeof mod === 'function' ? mod : mod.handler;
        const routeName = typeof mod === 'function' ? endpoint.name : mod.id;
        const scopedRouter = express_1.default.Router();
        router.use(`/${routeName}`, scopedRouter);
        register(scopedRouter, {
            services,
            exceptions: { ...exceptions, ...sharedExceptions },
            env: env_1.default,
            database: (0, database_1.default)(),
            emitter: this.apiEmitter,
            logger: logger_1.default,
            getSchema: get_schema_1.getSchema,
        });
        this.apiExtensions.endpoints.push({
            path: endpointPath,
        });
    }
    unregisterHooks() {
        for (const hook of this.apiExtensions.hooks) {
            for (const event of hook.events) {
                switch (event.type) {
                    case 'filter':
                        emitter_1.default.offFilter(event.name, event.handler);
                        break;
                    case 'action':
                        emitter_1.default.offAction(event.name, event.handler);
                        break;
                    case 'init':
                        emitter_1.default.offInit(event.name, event.handler);
                        break;
                    case 'schedule':
                        event.task.stop();
                        break;
                }
            }
            delete require.cache[require.resolve(hook.path)];
        }
        this.apiExtensions.hooks = [];
    }
    unregisterEndpoints() {
        for (const endpoint of this.apiExtensions.endpoints) {
            delete require.cache[require.resolve(endpoint.path)];
        }
        this.endpointRouter.stack = [];
        this.apiExtensions.endpoints = [];
    }
}
