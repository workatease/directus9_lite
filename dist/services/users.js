"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const lodash_1 = require("lodash");
const database_1 = __importDefault(require("../database"));
const env_1 = __importDefault(require("../env"));
const exceptions_1 = require("@directus/shared/exceptions");
const exceptions_2 = require("../exceptions");
const record_not_unique_1 = require("../exceptions/database/record-not-unique");
const is_url_allowed_1 = __importDefault(require("../utils/is-url-allowed"));
const utils_1 = require("@directus/shared/utils");
const url_1 = require("../utils/url");
const items_1 = require("./items");
const mail_1 = require("./mail");
const settings_1 = require("./settings");
const stall_1 = require("../utils/stall");
const perf_hooks_1 = require("perf_hooks");
const utils_2 = require("@directus/shared/utils");
class UsersService extends items_1.ItemsService {
    constructor(options) {
        super('directus_users', options);
        this.knex = options.knex || (0, database_1.default)();
        this.accountability = options.accountability || null;
        this.schema = options.schema;
    }
    /**
     * User email has to be unique case-insensitive. This is an additional check to make sure that
     * the email is unique regardless of casing
     */
    async checkUniqueEmails(emails, excludeKey) {
        emails = emails.map((email) => email.toLowerCase());
        const duplicates = emails.filter((value, index, array) => array.indexOf(value) !== index);
        if (duplicates.length) {
            throw new record_not_unique_1.RecordNotUniqueException('email', {
                collection: 'directus_users',
                field: 'email',
                invalid: duplicates[0],
            });
        }
        const query = this.knex
            .select('email')
            .from('directus_users')
            .whereRaw(`LOWER(??) IN (${emails.map(() => '?')})`, ['email', ...emails]);
        if (excludeKey) {
            query.whereNot('id', excludeKey);
        }
        const results = await query;
        if (results.length) {
            throw new record_not_unique_1.RecordNotUniqueException('email', {
                collection: 'directus_users',
                field: 'email',
                invalid: results[0].email,
            });
        }
    }
    /**
     * Check if the provided password matches the strictness as configured in
     * directus_settings.auth_password_policy
     */
    async checkPasswordPolicy(passwords) {
        const settingsService = new settings_1.SettingsService({
            schema: this.schema,
            knex: this.knex,
        });
        const { auth_password_policy: policyRegExString } = await settingsService.readSingleton({
            fields: ['auth_password_policy'],
        });
        if (!policyRegExString) {
            return;
        }
        const wrapped = policyRegExString.startsWith('/') && policyRegExString.endsWith('/');
        const regex = new RegExp(wrapped ? policyRegExString.slice(1, -1) : policyRegExString);
        for (const password of passwords) {
            if (!regex.test(password)) {
                throw new exceptions_1.FailedValidationException({
                    message: `Provided password doesn't match password policy`,
                    path: ['password'],
                    type: 'custom.pattern.base',
                    context: {
                        value: password,
                    },
                });
            }
        }
    }
    async checkRemainingAdminExistence(excludeKeys) {
        // Make sure there's at least one admin user left after this deletion is done
        const otherAdminUsers = await this.knex
            .count('*', { as: 'count' })
            .from('directus_users')
            .whereNotIn('directus_users.id', excludeKeys)
            .andWhere({ 'directus_roles.admin_access': true })
            .leftJoin('directus_roles', 'directus_users.role', 'directus_roles.id')
            .first();
        const otherAdminUsersCount = +((otherAdminUsers === null || otherAdminUsers === void 0 ? void 0 : otherAdminUsers.count) || 0);
        if (otherAdminUsersCount === 0) {
            throw new exceptions_2.UnprocessableEntityException(`You can't remove the last admin user from the role.`);
        }
    }
    /**
     * Create a new user
     */
    async createOne(data, opts) {
        const result = await this.createMany([data], opts);
        return result[0];
    }
    /**
     * Create multiple new users
     */
    async createMany(data, opts) {
        const emails = data.map((payload) => payload.email).filter((email) => email);
        const passwords = data.map((payload) => payload.password).filter((password) => password);
        if (emails.length) {
            await this.checkUniqueEmails(emails);
        }
        if (passwords.length) {
            await this.checkPasswordPolicy(passwords);
        }
        return await super.createMany(data, opts);
    }
    /**
     * Update many users by query
     */
    async updateByQuery(query, data, opts) {
        const keys = await this.getKeysByQuery(query);
        return keys.length ? await this.updateMany(keys, data, opts) : [];
    }
    /**
     * Update a single user by primary key
     */
    async updateOne(key, data, opts) {
        await this.updateMany([key], data, opts);
        return key;
    }
    /**
     * Update many users by primary key
     */
    async updateMany(keys, data, opts) {
        if (data.role) {
            const newRole = await this.knex.select('admin_access').from('directus_roles').where('id', data.role).first();
            if (!(newRole === null || newRole === void 0 ? void 0 : newRole.admin_access)) {
                await this.checkRemainingAdminExistence(keys);
            }
        }
        if (data.email) {
            if (keys.length > 1) {
                throw new record_not_unique_1.RecordNotUniqueException('email', {
                    collection: 'directus_users',
                    field: 'email',
                    invalid: data.email,
                });
            }
            await this.checkUniqueEmails([data.email], keys[0]);
        }
        if (data.password) {
            await this.checkPasswordPolicy([data.password]);
        }
        if (data.tfa_secret !== undefined) {
            throw new exceptions_2.InvalidPayloadException(`You can't change the "tfa_secret" value manually.`);
        }
        if (data.provider !== undefined) {
            throw new exceptions_2.InvalidPayloadException(`You can't change the "provider" value manually.`);
        }
        if (data.external_identifier !== undefined) {
            throw new exceptions_2.InvalidPayloadException(`You can't change the "external_identifier" value manually.`);
        }
        return await super.updateMany(keys, data, opts);
    }
    /**
     * Delete a single user by primary key
     */
    async deleteOne(key, opts) {
        await this.deleteMany([key], opts);
        return key;
    }
    /**
     * Delete multiple users by primary key
     */
    async deleteMany(keys, opts) {
        await this.checkRemainingAdminExistence(keys);
        await this.knex('directus_notifications').update({ sender: null }).whereIn('sender', keys);
        await super.deleteMany(keys, opts);
        return keys;
    }
    async deleteByQuery(query, opts) {
        const primaryKeyField = this.schema.collections[this.collection].primary;
        const readQuery = (0, lodash_1.cloneDeep)(query);
        readQuery.fields = [primaryKeyField];
        // Not authenticated:
        const itemsService = new items_1.ItemsService(this.collection, {
            knex: this.knex,
            schema: this.schema,
        });
        const itemsToDelete = await itemsService.readByQuery(readQuery);
        const keys = itemsToDelete.map((item) => item[primaryKeyField]);
        if (keys.length === 0)
            return [];
        return await this.deleteMany(keys, opts);
    }
    async inviteUser(email, role, url, subject) {
        if (url && (0, is_url_allowed_1.default)(url, env_1.default.USER_INVITE_URL_ALLOW_LIST) === false) {
            throw new exceptions_2.InvalidPayloadException(`Url "${url}" can't be used to invite users.`);
        }
        const emails = (0, utils_1.toArray)(email);
        const mailService = new mail_1.MailService({
            schema: this.schema,
            accountability: this.accountability,
        });
        for (const email of emails) {
            const payload = { email, scope: 'invite' };
            const token = jsonwebtoken_1.default.sign(payload, env_1.default.SECRET, { expiresIn: '7d', issuer: 'directus' });
            const subjectLine = subject !== null && subject !== void 0 ? subject : "You've been invited";
            const inviteURL = url ? new url_1.Url(url) : new url_1.Url(env_1.default.PUBLIC_URL).addPath('admin', 'accept-invite');
            inviteURL.setQuery('token', token);
            // Create user first to verify uniqueness
            await this.createOne({ email, role, status: 'invited' });
            await mailService.send({
                to: email,
                subject: subjectLine,
                template: {
                    name: 'user-invitation',
                    data: {
                        url: inviteURL.toString(),
                        email,
                    },
                },
            });
        }
    }
    async acceptInvite(token, password) {
        const { email, scope } = jsonwebtoken_1.default.verify(token, env_1.default.SECRET, { issuer: 'directus' });
        if (scope !== 'invite')
            throw new exceptions_2.ForbiddenException();
        const user = await this.knex.select('id', 'status').from('directus_users').where({ email }).first();
        if ((user === null || user === void 0 ? void 0 : user.status) !== 'invited') {
            throw new exceptions_2.InvalidPayloadException(`Email address ${email} hasn't been invited.`);
        }
        // Allow unauthenticated update
        const service = new UsersService({
            knex: this.knex,
            schema: this.schema,
        });
        await service.updateOne(user.id, { password, status: 'active' });
    }
    async requestPasswordReset(email, url, subject) {
        if (url && (0, is_url_allowed_1.default)(url, env_1.default.PASSWORD_RESET_URL_ALLOW_LIST) === false) {
            throw new exceptions_2.InvalidPayloadException(`Url "${url}" can't be used to reset passwords.`);
        }
        const STALL_TIME = 500;
        const timeStart = perf_hooks_1.performance.now();
        const user = await this.knex.select('status', 'password').from('directus_users').where({ email }).first();
        if ((user === null || user === void 0 ? void 0 : user.status) !== 'active') {
            await (0, stall_1.stall)(STALL_TIME, timeStart);
            throw new exceptions_2.ForbiddenException();
        }
        const mailService = new mail_1.MailService({
            schema: this.schema,
            knex: this.knex,
            accountability: this.accountability,
        });
        const payload = { email, scope: 'password-reset', hash: (0, utils_2.getSimpleHash)('' + user.password) };
        const token = jsonwebtoken_1.default.sign(payload, env_1.default.SECRET, { expiresIn: '1d', issuer: 'directus' });
        const acceptURL = url ? `${url}?token=${token}` : `${env_1.default.PUBLIC_URL}/admin/reset-password?token=${token}`;
        const subjectLine = subject ? subject : 'Password Reset Request';
        await mailService.send({
            to: email,
            subject: subjectLine,
            template: {
                name: 'password-reset',
                data: {
                    url: acceptURL,
                    email,
                },
            },
        });
        await (0, stall_1.stall)(STALL_TIME, timeStart);
    }
    async resetPassword(token, password) {
        const { email, scope, hash } = jsonwebtoken_1.default.verify(token, env_1.default.SECRET, { issuer: 'directus' });
        if (scope !== 'password-reset' || !hash)
            throw new exceptions_2.ForbiddenException();
        await this.checkPasswordPolicy([password]);
        const user = await this.knex.select('id', 'status', 'password').from('directus_users').where({ email }).first();
        if ((user === null || user === void 0 ? void 0 : user.status) !== 'active' || hash !== (0, utils_2.getSimpleHash)('' + user.password)) {
            throw new exceptions_2.ForbiddenException();
        }
        // Allow unauthenticated update
        const service = new UsersService({
            knex: this.knex,
            schema: this.schema,
        });
        await service.updateOne(user.id, { password, status: 'active' });
    }
}
exports.UsersService = UsersService;
