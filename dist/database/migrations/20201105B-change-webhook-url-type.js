"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = void 0;
const helpers_1 = require("../helpers");
async function up(knex) {
    const helper = (0, helpers_1.getHelpers)(knex).schema;
    await helper.changeToText('directus_webhooks', 'url');
}
exports.up = up;
async function down(knex) {
    await (0, helpers_1.getHelpers)(knex).schema.changeToString('directus_webhooks', 'url', {
        nullable: false,
        length: 255,
    });
}
exports.down = down;
