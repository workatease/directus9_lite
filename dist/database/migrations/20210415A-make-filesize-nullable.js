"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = void 0;
const helpers_1 = require("../helpers");
async function up(knex) {
    const helper = (0, helpers_1.getHelpers)(knex).schema;
    await helper.changeToInteger('directus_files', 'filesize', {
        nullable: true,
        default: null,
    });
}
exports.up = up;
async function down(knex) {
    const helper = (0, helpers_1.getHelpers)(knex).schema;
    await helper.changeToInteger('directus_files', 'filesize', {
        nullable: false,
        default: 0,
    });
}
exports.down = down;
