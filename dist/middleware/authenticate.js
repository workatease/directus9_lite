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
const jsonwebtoken_1 = __importStar(require("jsonwebtoken"));
const database_1 = __importDefault(require("../database"));
const env_1 = __importDefault(require("../env"));
const exceptions_1 = require("../exceptions");
const async_handler_1 = __importDefault(require("../utils/async-handler"));
const get_ip_from_req_1 = require("../utils/get-ip-from-req");
const is_directus_jwt_1 = __importDefault(require("../utils/is-directus-jwt"));
/**
 * Verify the passed JWT and assign the user ID and role to `req`
 */
const authenticate = (0, async_handler_1.default)(async (req, res, next) => {
    req.accountability = {
        user: null,
        role: null,
        admin: false,
        app: false,
        ip: (0, get_ip_from_req_1.getIPFromReq)(req),
        userAgent: req.get('user-agent'),
    };
    const database = (0, database_1.default)();
    if (req.token) {
        if ((0, is_directus_jwt_1.default)(req.token)) {
            let payload;
            try {
                payload = jsonwebtoken_1.default.verify(req.token, env_1.default.SECRET, { issuer: 'directus' });
            }
            catch (err) {
                if (err instanceof jsonwebtoken_1.TokenExpiredError) {
                    throw new exceptions_1.InvalidCredentialsException('Token expired.');
                }
                else if (err instanceof jsonwebtoken_1.JsonWebTokenError) {
                    throw new exceptions_1.InvalidCredentialsException('Token invalid.');
                }
                else {
                    throw err;
                }
            }
            req.accountability.share = payload.share;
            req.accountability.share_scope = payload.share_scope;
            req.accountability.user = payload.id;
            req.accountability.role = payload.role;
            req.accountability.admin = payload.admin_access === true || payload.admin_access == 1;
            req.accountability.app = payload.app_access === true || payload.app_access == 1;
        }
        else {
            // Try finding the user with the provided token
            const user = await database
                .select('directus_users.id', 'directus_users.role', 'directus_roles.admin_access', 'directus_roles.app_access')
                .from('directus_users')
                .leftJoin('directus_roles', 'directus_users.role', 'directus_roles.id')
                .where({
                'directus_users.token': req.token,
                status: 'active',
            })
                .first();
            if (!user) {
                throw new exceptions_1.InvalidCredentialsException();
            }
            req.accountability.user = user.id;
            req.accountability.role = user.role;
            req.accountability.admin = user.admin_access === true || user.admin_access == 1;
            req.accountability.app = user.app_access === true || user.app_access == 1;
        }
    }
    return next();
});
exports.default = authenticate;
