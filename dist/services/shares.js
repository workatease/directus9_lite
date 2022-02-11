"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharesService = void 0;
const items_1 = require("./items");
const argon2_1 = __importDefault(require("argon2"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ms_1 = __importDefault(require("ms"));
const exceptions_1 = require("../exceptions");
const env_1 = __importDefault(require("../env"));
const nanoid_1 = require("nanoid");
const authorization_1 = require("./authorization");
const users_1 = require("./users");
const mail_1 = require("./mail");
const user_name_1 = require("../utils/user-name");
const md_1 = require("../utils/md");
class SharesService extends items_1.ItemsService {
    constructor(options) {
        super('directus_shares', options);
        this.authorizationService = new authorization_1.AuthorizationService({
            accountability: this.accountability,
            knex: this.knex,
            schema: this.schema,
        });
    }
    async createOne(data, opts) {
        await this.authorizationService.checkAccess('share', data.collection, data.item);
        return super.createOne(data, opts);
    }
    async login(payload) {
        var _a, _b;
        const record = await this.knex
            .select({
            share_id: 'id',
            share_role: 'role',
            share_item: 'item',
            share_collection: 'collection',
            share_start: 'date_start',
            share_end: 'date_end',
            share_times_used: 'times_used',
            share_max_uses: 'max_uses',
            share_password: 'password',
        })
            .from('directus_shares')
            .where('id', payload.share)
            .andWhere((subQuery) => {
            subQuery.whereNull('date_end').orWhere('date_end', '>=', new Date());
        })
            .andWhere((subQuery) => {
            subQuery.whereNull('date_start').orWhere('date_start', '<=', new Date());
        })
            .andWhere((subQuery) => {
            subQuery.whereNull('max_uses').orWhere('max_uses', '>=', this.knex.ref('times_used'));
        })
            .first();
        if (!record) {
            throw new exceptions_1.InvalidCredentialsException();
        }
        if (record.share_password && !(await argon2_1.default.verify(record.share_password, payload.password))) {
            throw new exceptions_1.InvalidCredentialsException();
        }
        await this.knex('directus_shares')
            .update({ times_used: record.share_times_used + 1 })
            .where('id', record.share_id);
        const tokenPayload = {
            app_access: false,
            admin_access: false,
            role: record.share_role,
            share: record.share_id,
            share_scope: {
                item: record.share_item,
                collection: record.share_collection,
            },
        };
        const accessToken = jsonwebtoken_1.default.sign(tokenPayload, env_1.default.SECRET, {
            expiresIn: env_1.default.ACCESS_TOKEN_TTL,
            issuer: 'directus',
        });
        const refreshToken = (0, nanoid_1.nanoid)(64);
        const refreshTokenExpiration = new Date(Date.now() + (0, ms_1.default)(env_1.default.REFRESH_TOKEN_TTL));
        await this.knex('directus_sessions').insert({
            token: refreshToken,
            expires: refreshTokenExpiration,
            ip: (_a = this.accountability) === null || _a === void 0 ? void 0 : _a.ip,
            user_agent: (_b = this.accountability) === null || _b === void 0 ? void 0 : _b.userAgent,
            share: record.share_id,
        });
        await this.knex('directus_sessions').delete().where('expires', '<', new Date());
        return {
            accessToken,
            refreshToken,
            expires: (0, ms_1.default)(env_1.default.ACCESS_TOKEN_TTL),
        };
    }
    /**
     * Send a link to the given share ID to the given email(s). Note: you can only send a link to a share
     * if you have read access to that particular share
     */
    async invite(payload) {
        var _a;
        if (!((_a = this.accountability) === null || _a === void 0 ? void 0 : _a.user))
            throw new exceptions_1.ForbiddenException();
        const share = await this.readOne(payload.share, { fields: ['collection'] });
        const usersService = new users_1.UsersService({
            knex: this.knex,
            schema: this.schema,
        });
        const mailService = new mail_1.MailService({ schema: this.schema, accountability: this.accountability });
        const userInfo = await usersService.readOne(this.accountability.user, {
            fields: ['first_name', 'last_name', 'email', 'id'],
        });
        const message = `
Hello!

${(0, user_name_1.userName)(userInfo)} has invited you to view an item in ${share.collection}.

[Open](${env_1.default.PUBLIC_URL}/admin/shared/${payload.share})
`;
        for (const email of payload.emails) {
            await mailService.send({
                template: {
                    name: 'base',
                    data: {
                        html: (0, md_1.md)(message),
                    },
                },
                to: email,
                subject: `${(0, user_name_1.userName)(userInfo)} has shared an item with you`,
            });
        }
    }
}
exports.SharesService = SharesService;
