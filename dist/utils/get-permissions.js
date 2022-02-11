"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPermissions = void 0;
const utils_1 = require("@directus/shared/utils");
const lodash_1 = require("lodash");
const database_1 = __importDefault(require("../database"));
const app_access_permissions_1 = require("../database/system-data/app-access-permissions");
const merge_permissions_1 = require("../utils/merge-permissions");
const merge_permissions_for_share_1 = require("./merge-permissions-for-share");
const users_1 = require("../services/users");
const roles_1 = require("../services/roles");
const cache_1 = require("../cache");
const object_hash_1 = __importDefault(require("object-hash"));
const env_1 = __importDefault(require("../env"));
async function getPermissions(accountability, schema) {
    const database = (0, database_1.default)();
    const { systemCache, cache } = (0, cache_1.getCache)();
    let permissions = [];
    const { user, role, app, admin, share_scope } = accountability;
    const cacheKey = `permissions-${(0, object_hash_1.default)({ user, role, app, admin, share_scope })}`;
    if (env_1.default.CACHE_PERMISSIONS !== false) {
        const cachedPermissions = await systemCache.get(cacheKey);
        if (cachedPermissions) {
            if (!cachedPermissions.containDynamicData) {
                return processPermissions(accountability, cachedPermissions.permissions, {});
            }
            const cachedFilterContext = await (cache === null || cache === void 0 ? void 0 : cache.get(`filterContext-${(0, object_hash_1.default)({ user, role, permissions: cachedPermissions.permissions })}`));
            if (cachedFilterContext) {
                return processPermissions(accountability, cachedPermissions.permissions, cachedFilterContext);
            }
            else {
                const { permissions: parsedPermissions, requiredPermissionData, containDynamicData, } = parsePermissions(cachedPermissions.permissions);
                permissions = parsedPermissions;
                const filterContext = containDynamicData
                    ? await getFilterContext(schema, accountability, requiredPermissionData)
                    : {};
                if (containDynamicData && env_1.default.CACHE_ENABLED !== false) {
                    await (cache === null || cache === void 0 ? void 0 : cache.set(`filterContext-${(0, object_hash_1.default)({ user, role, permissions })}`, filterContext));
                }
                return processPermissions(accountability, permissions, filterContext);
            }
        }
    }
    if (accountability.admin !== true) {
        const query = database.select('*').from('directus_permissions');
        if (accountability.role) {
            query.where({ role: accountability.role });
        }
        else {
            query.whereNull('role');
        }
        const permissionsForRole = await query;
        const { permissions: parsedPermissions, requiredPermissionData, containDynamicData, } = parsePermissions(permissionsForRole);
        permissions = parsedPermissions;
        if (accountability.app === true) {
            permissions = (0, merge_permissions_1.mergePermissions)('or', permissions, app_access_permissions_1.appAccessMinimalPermissions.map((perm) => ({ ...perm, role: accountability.role })));
        }
        if (accountability.share_scope) {
            permissions = (0, merge_permissions_for_share_1.mergePermissionsForShare)(permissions, accountability, schema);
        }
        const filterContext = containDynamicData
            ? await getFilterContext(schema, accountability, requiredPermissionData)
            : {};
        if (env_1.default.CACHE_PERMISSIONS !== false) {
            await systemCache.set(cacheKey, { permissions, containDynamicData });
            if (containDynamicData && env_1.default.CACHE_ENABLED !== false) {
                await (cache === null || cache === void 0 ? void 0 : cache.set(`filterContext-${(0, object_hash_1.default)({ user, role, permissions })}`, filterContext));
            }
        }
        return processPermissions(accountability, permissions, filterContext);
    }
    return permissions;
}
exports.getPermissions = getPermissions;
function parsePermissions(permissions) {
    const requiredPermissionData = {
        $CURRENT_USER: [],
        $CURRENT_ROLE: [],
    };
    let containDynamicData = false;
    permissions = permissions.map((permissionRaw) => {
        const permission = (0, lodash_1.cloneDeep)(permissionRaw);
        if (permission.permissions && typeof permission.permissions === 'string') {
            permission.permissions = JSON.parse(permission.permissions);
        }
        else if (permission.permissions === null) {
            permission.permissions = {};
        }
        if (permission.validation && typeof permission.validation === 'string') {
            permission.validation = JSON.parse(permission.validation);
        }
        else if (permission.validation === null) {
            permission.validation = {};
        }
        if (permission.presets && typeof permission.presets === 'string') {
            permission.presets = JSON.parse(permission.presets);
        }
        else if (permission.presets === null) {
            permission.presets = {};
        }
        if (permission.fields && typeof permission.fields === 'string') {
            permission.fields = permission.fields.split(',');
        }
        else if (permission.fields === null) {
            permission.fields = [];
        }
        const extractPermissionData = (val) => {
            if (typeof val === 'string' && val.startsWith('$CURRENT_USER.')) {
                requiredPermissionData.$CURRENT_USER.push(val.replace('$CURRENT_USER.', ''));
                containDynamicData = true;
            }
            if (typeof val === 'string' && val.startsWith('$CURRENT_ROLE.')) {
                requiredPermissionData.$CURRENT_ROLE.push(val.replace('$CURRENT_ROLE.', ''));
                containDynamicData = true;
            }
            return val;
        };
        (0, utils_1.deepMap)(permission.permissions, extractPermissionData);
        (0, utils_1.deepMap)(permission.validation, extractPermissionData);
        (0, utils_1.deepMap)(permission.presets, extractPermissionData);
        return permission;
    });
    return { permissions, requiredPermissionData, containDynamicData };
}
async function getFilterContext(schema, accountability, requiredPermissionData) {
    const usersService = new users_1.UsersService({ schema });
    const rolesService = new roles_1.RolesService({ schema });
    const filterContext = {};
    if (accountability.user && requiredPermissionData.$CURRENT_USER.length > 0) {
        filterContext.$CURRENT_USER = await usersService.readOne(accountability.user, {
            fields: requiredPermissionData.$CURRENT_USER,
        });
    }
    if (accountability.role && requiredPermissionData.$CURRENT_ROLE.length > 0) {
        filterContext.$CURRENT_ROLE = await rolesService.readOne(accountability.role, {
            fields: requiredPermissionData.$CURRENT_ROLE,
        });
    }
    return filterContext;
}
function processPermissions(accountability, permissions, filterContext) {
    return permissions.map((permission) => {
        permission.permissions = (0, utils_1.parseFilter)(permission.permissions, accountability, filterContext);
        permission.validation = (0, utils_1.parseFilter)(permission.validation, accountability, filterContext);
        permission.presets = (0, utils_1.parsePreset)(permission.presets, accountability, filterContext);
        return permission;
    });
}
