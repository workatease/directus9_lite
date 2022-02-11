"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = void 0;
async function up(knex) {
    await knex.schema.alterTable('directus_roles', (table) => {
        table.dropColumn('module_list');
    });
    await knex.schema.alterTable('directus_settings', (table) => {
        table.json('module_bar');
    });
}
exports.up = up;
async function down(knex) {
    await knex.schema.alterTable('directus_roles', (table) => {
        table.json('module_list');
    });
    await knex.schema.alterTable('directus_settings', (table) => {
        table.dropColumn('module_bar');
    });
}
exports.down = down;
