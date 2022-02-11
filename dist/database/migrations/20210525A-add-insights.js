"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = void 0;
async function up(knex) {
    await knex.schema.createTable('directus_dashboards', (table) => {
        table.uuid('id').primary().notNullable();
        table.string('name').notNullable();
        table.string('icon', 30).notNullable().defaultTo('dashboard');
        table.text('note');
        table.timestamp('date_created').defaultTo(knex.fn.now());
        table.uuid('user_created').references('id').inTable('directus_users').onDelete('SET NULL');
    });
    await knex.schema.createTable('directus_panels', (table) => {
        table.uuid('id').primary().notNullable();
        table.uuid('dashboard').notNullable().references('id').inTable('directus_dashboards').onDelete('CASCADE');
        table.string('name');
        table.string('icon', 30).defaultTo('insert_chart');
        table.string('color', 10);
        table.boolean('show_header').notNullable().defaultTo(false);
        table.text('note');
        table.string('type').notNullable();
        table.integer('position_x').notNullable();
        table.integer('position_y').notNullable();
        table.integer('width').notNullable();
        table.integer('height').notNullable();
        table.json('options');
        table.timestamp('date_created').defaultTo(knex.fn.now());
        table.uuid('user_created').references('id').inTable('directus_users').onDelete('SET NULL');
    });
}
exports.up = up;
async function down(knex) {
    await knex.schema.dropTable('directus_panels');
    await knex.schema.dropTable('directus_dashboards');
}
exports.down = down;
