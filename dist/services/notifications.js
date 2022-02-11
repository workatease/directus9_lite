"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const _1 = require(".");
const items_1 = require("./items");
const md_1 = require("../utils/md");
class NotificationsService extends items_1.ItemsService {
    constructor(options) {
        super('directus_notifications', options);
        this.usersService = new _1.UsersService({ schema: this.schema });
        this.mailService = new _1.MailService({ schema: this.schema, accountability: this.accountability });
    }
    async createOne(data, opts) {
        await this.sendEmail(data);
        return super.createOne(data, opts);
    }
    async createMany(data, opts) {
        for (const notification of data) {
            await this.sendEmail(notification);
        }
        return super.createMany(data, opts);
    }
    async sendEmail(data) {
        if (data.recipient) {
            const user = await this.usersService.readOne(data.recipient, { fields: ['email', 'email_notifications'] });
            if (user.email && user.email_notifications === true) {
                await this.mailService.send({
                    template: {
                        name: 'base',
                        data: {
                            html: data.message ? (0, md_1.md)(data.message) : '',
                        },
                    },
                    to: user.email,
                    subject: data.subject,
                });
            }
        }
    }
}
exports.NotificationsService = NotificationsService;
