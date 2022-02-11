"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthenticationService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ms_1 = __importDefault(require("ms"));
const nanoid_1 = require("nanoid");
const database_1 = __importDefault(require("../database"));
const emitter_1 = __importDefault(require("../emitter"));
const env_1 = __importDefault(require("../env"));
const auth_1 = require("../auth");
const constants_1 = require("../constants");
const exceptions_1 = require("../exceptions");
const rate_limiter_1 = require("../rate-limiter");
const activity_1 = require("./activity");
const tfa_1 = require("./tfa");
const types_1 = require("../types");
const settings_1 = require("./settings");
const lodash_1 = require("lodash");
const perf_hooks_1 = require("perf_hooks");
const stall_1 = require("../utils/stall");
const loginAttemptsLimiter = (0, rate_limiter_1.createRateLimiter)({ duration: 0 });
class AuthenticationService {
    constructor(options) {
        this.knex = options.knex || (0, database_1.default)();
        this.accountability = options.accountability || null;
        this.activityService = new activity_1.ActivityService({ knex: this.knex, schema: options.schema });
        this.schema = options.schema;
    }
    /**
     * Retrieve the tokens for a given user email.
     *
     * Password is optional to allow usage of this function within the SSO flow and extensions. Make sure
     * to handle password existence checks elsewhere
     */
    async login(providerName = constants_1.DEFAULT_AUTH_PROVIDER, payload, otp) {
        var _a, _b;
        const STALL_TIME = 100;
        const timeStart = perf_hooks_1.performance.now();
        const provider = (0, auth_1.getAuthProvider)(providerName);
        const user = await this.knex
            .select('u.id', 'u.first_name', 'u.last_name', 'u.email', 'u.password', 'u.status', 'u.role', 'r.admin_access', 'r.app_access', 'u.tfa_secret', 'u.provider', 'u.external_identifier', 'u.auth_data')
            .from('directus_users as u')
            .leftJoin('directus_roles as r', 'u.role', 'r.id')
            .where('u.id', await provider.getUserID((0, lodash_1.cloneDeep)(payload)))
            .andWhere('u.provider', providerName)
            .first();
        const updatedPayload = await emitter_1.default.emitFilter('auth.login', payload, {
            status: 'pending',
            user: user === null || user === void 0 ? void 0 : user.id,
            provider: providerName,
        }, {
            database: this.knex,
            schema: this.schema,
            accountability: this.accountability,
        });
        const emitStatus = (status) => {
            emitter_1.default.emitAction('auth.login', {
                payload: updatedPayload,
                status,
                user: user === null || user === void 0 ? void 0 : user.id,
                provider: providerName,
            }, {
                database: this.knex,
                schema: this.schema,
                accountability: this.accountability,
            });
        };
        if ((user === null || user === void 0 ? void 0 : user.status) !== 'active') {
            emitStatus('fail');
            if ((user === null || user === void 0 ? void 0 : user.status) === 'suspended') {
                await (0, stall_1.stall)(STALL_TIME, timeStart);
                throw new exceptions_1.UserSuspendedException();
            }
            else {
                await (0, stall_1.stall)(STALL_TIME, timeStart);
                throw new exceptions_1.InvalidCredentialsException();
            }
        }
        const settingsService = new settings_1.SettingsService({
            knex: this.knex,
            schema: this.schema,
        });
        const { auth_login_attempts: allowedAttempts } = await settingsService.readSingleton({
            fields: ['auth_login_attempts'],
        });
        if (allowedAttempts !== null) {
            loginAttemptsLimiter.points = allowedAttempts;
            try {
                await loginAttemptsLimiter.consume(user.id);
            }
            catch {
                await this.knex('directus_users').update({ status: 'suspended' }).where({ id: user.id });
                user.status = 'suspended';
                // This means that new attempts after the user has been re-activated will be accepted
                await loginAttemptsLimiter.set(user.id, 0, 0);
            }
        }
        try {
            await provider.login((0, lodash_1.clone)(user), (0, lodash_1.cloneDeep)(updatedPayload));
        }
        catch (e) {
            emitStatus('fail');
            await (0, stall_1.stall)(STALL_TIME, timeStart);
            throw e;
        }
        if (user.tfa_secret && !otp) {
            emitStatus('fail');
            await (0, stall_1.stall)(STALL_TIME, timeStart);
            throw new exceptions_1.InvalidOTPException(`"otp" is required`);
        }
        if (user.tfa_secret && otp) {
            const tfaService = new tfa_1.TFAService({ knex: this.knex, schema: this.schema });
            const otpValid = await tfaService.verifyOTP(user.id, otp);
            if (otpValid === false) {
                emitStatus('fail');
                await (0, stall_1.stall)(STALL_TIME, timeStart);
                throw new exceptions_1.InvalidOTPException(`"otp" is invalid`);
            }
        }
        const tokenPayload = {
            id: user.id,
            role: user.role,
            app_access: user.app_access,
            admin_access: user.admin_access,
        };
        const customClaims = await emitter_1.default.emitFilter('auth.jwt', tokenPayload, {
            status: 'pending',
            user: user === null || user === void 0 ? void 0 : user.id,
            provider: providerName,
            type: 'login',
        }, {
            database: this.knex,
            schema: this.schema,
            accountability: this.accountability,
        });
        const accessToken = jsonwebtoken_1.default.sign(customClaims, env_1.default.SECRET, {
            expiresIn: env_1.default.ACCESS_TOKEN_TTL,
            issuer: 'directus',
        });
        const refreshToken = (0, nanoid_1.nanoid)(64);
        const refreshTokenExpiration = new Date(Date.now() + (0, ms_1.default)(env_1.default.REFRESH_TOKEN_TTL));
        await this.knex('directus_sessions').insert({
            token: refreshToken,
            user: user.id,
            expires: refreshTokenExpiration,
            ip: (_a = this.accountability) === null || _a === void 0 ? void 0 : _a.ip,
            user_agent: (_b = this.accountability) === null || _b === void 0 ? void 0 : _b.userAgent,
        });
        await this.knex('directus_sessions').delete().where('expires', '<', new Date());
        if (this.accountability) {
            await this.activityService.createOne({
                action: types_1.Action.LOGIN,
                user: user.id,
                ip: this.accountability.ip,
                user_agent: this.accountability.userAgent,
                collection: 'directus_users',
                item: user.id,
            });
        }
        await this.knex('directus_users').update({ last_access: new Date() }).where({ id: user.id });
        emitStatus('success');
        if (allowedAttempts !== null) {
            await loginAttemptsLimiter.set(user.id, 0, 0);
        }
        await (0, stall_1.stall)(STALL_TIME, timeStart);
        return {
            accessToken,
            refreshToken,
            expires: (0, ms_1.default)(env_1.default.ACCESS_TOKEN_TTL),
            id: user.id,
        };
    }
    async refresh(refreshToken) {
        if (!refreshToken) {
            throw new exceptions_1.InvalidCredentialsException();
        }
        const record = await this.knex
            .select({
            session_expires: 's.expires',
            user_id: 'u.id',
            user_first_name: 'u.first_name',
            user_last_name: 'u.last_name',
            user_email: 'u.email',
            user_password: 'u.password',
            user_status: 'u.status',
            user_provider: 'u.provider',
            user_external_identifier: 'u.external_identifier',
            user_auth_data: 'u.auth_data',
            role_id: 'r.id',
            role_admin_access: 'r.admin_access',
            role_app_access: 'r.app_access',
            share_id: 'd.id',
            share_item: 'd.item',
            share_role: 'd.role',
            share_collection: 'd.collection',
            share_start: 'd.date_start',
            share_end: 'd.date_end',
            share_times_used: 'd.times_used',
            share_max_uses: 'd.max_uses',
        })
            .from('directus_sessions AS s')
            .leftJoin('directus_users AS u', 's.user', 'u.id')
            .leftJoin('directus_shares AS d', 's.share', 'd.id')
            .leftJoin('directus_roles AS r', (join) => {
            join.onIn('r.id', [this.knex.ref('u.role'), this.knex.ref('d.role')]);
        })
            .where('s.token', refreshToken)
            .andWhere('s.expires', '>=', new Date())
            .andWhere((subQuery) => {
            subQuery.whereNull('d.date_end').orWhere('d.date_end', '>=', new Date());
        })
            .andWhere((subQuery) => {
            subQuery.whereNull('d.date_start').orWhere('d.date_start', '<=', new Date());
        })
            .first();
        if (!record || (!record.share_id && !record.user_id)) {
            throw new exceptions_1.InvalidCredentialsException();
        }
        if (record.user_id) {
            const provider = (0, auth_1.getAuthProvider)(record.user_provider);
            await provider.refresh({
                id: record.user_id,
                first_name: record.user_first_name,
                last_name: record.user_last_name,
                email: record.user_email,
                password: record.user_password,
                status: record.user_status,
                provider: record.user_provider,
                external_identifier: record.user_external_identifier,
                auth_data: record.user_auth_data,
                role: record.role_id,
                app_access: record.role_app_access,
                admin_access: record.role_admin_access,
            });
        }
        const tokenPayload = {
            id: record.user_id,
            role: record.role_id,
            app_access: record.role_app_access,
            admin_access: record.role_admin_access,
        };
        if (record.share_id) {
            tokenPayload.share = record.share_id;
            tokenPayload.role = record.share_role;
            tokenPayload.share_scope = {
                collection: record.share_collection,
                item: record.share_item,
            };
            tokenPayload.app_access = false;
            tokenPayload.admin_access = false;
            delete tokenPayload.id;
        }
        const customClaims = await emitter_1.default.emitFilter('auth.jwt', tokenPayload, {
            status: 'pending',
            user: record.user_id,
            provider: record.user_provider,
            type: 'refresh',
        }, {
            database: this.knex,
            schema: this.schema,
            accountability: this.accountability,
        });
        const accessToken = jsonwebtoken_1.default.sign(customClaims, env_1.default.SECRET, {
            expiresIn: env_1.default.ACCESS_TOKEN_TTL,
            issuer: 'directus',
        });
        const newRefreshToken = (0, nanoid_1.nanoid)(64);
        const refreshTokenExpiration = new Date(Date.now() + (0, ms_1.default)(env_1.default.REFRESH_TOKEN_TTL));
        await this.knex('directus_sessions')
            .update({
            token: newRefreshToken,
            expires: refreshTokenExpiration,
        })
            .where({ token: refreshToken });
        if (record.user_id) {
            await this.knex('directus_users').update({ last_access: new Date() }).where({ id: record.user_id });
        }
        return {
            accessToken,
            refreshToken: newRefreshToken,
            expires: (0, ms_1.default)(env_1.default.ACCESS_TOKEN_TTL),
            id: record.user_id,
        };
    }
    async logout(refreshToken) {
        const record = await this.knex
            .select('u.id', 'u.first_name', 'u.last_name', 'u.email', 'u.password', 'u.status', 'u.role', 'u.provider', 'u.external_identifier', 'u.auth_data')
            .from('directus_sessions as s')
            .innerJoin('directus_users as u', 's.user', 'u.id')
            .where('s.token', refreshToken)
            .first();
        if (record) {
            const user = record;
            const provider = (0, auth_1.getAuthProvider)(user.provider);
            await provider.logout((0, lodash_1.clone)(user));
            await this.knex.delete().from('directus_sessions').where('token', refreshToken);
        }
    }
    async verifyPassword(userID, password) {
        const user = await this.knex
            .select('id', 'first_name', 'last_name', 'email', 'password', 'status', 'role', 'provider', 'external_identifier', 'auth_data')
            .from('directus_users')
            .where('id', userID)
            .first();
        if (!user) {
            throw new exceptions_1.InvalidCredentialsException();
        }
        const provider = (0, auth_1.getAuthProvider)(user.provider);
        await provider.verify((0, lodash_1.clone)(user), password);
    }
}
exports.AuthenticationService = AuthenticationService;
