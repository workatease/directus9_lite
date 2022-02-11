"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaHelper = void 0;
const index_1 = require("../../index");
const types_1 = require("../types");
class SchemaHelper extends types_1.DatabaseHelper {
    isOneOfClients(clients) {
        return clients.includes((0, index_1.getDatabaseClient)(this.knex));
    }
    async changeNullable(table, column, nullable) {
        await this.knex.schema.alterTable(table, (builder) => {
            if (nullable) {
                builder.setNullable(column);
            }
            else {
                builder.dropNullable(column);
            }
        });
    }
    async changeToText(table, column, options = {}) {
        await this.knex.schema.alterTable(table, (builder) => {
            const b = builder.string(column);
            if (options.nullable === true) {
                b.nullable();
            }
            if (options.nullable === false) {
                b.notNullable();
            }
            if (options.default !== undefined) {
                b.defaultTo(options.default);
            }
            b.alter();
        });
    }
    async changeToInteger(table, column, options = {}) {
        await this.knex.schema.alterTable(table, (builder) => {
            const b = builder.integer(column);
            if (options.nullable === true) {
                b.nullable();
            }
            if (options.nullable === false) {
                b.notNullable();
            }
            if (options.default !== undefined) {
                b.defaultTo(options.default);
            }
            b.alter();
        });
    }
    async changeToString(table, column, options = {}) {
        await this.knex.schema.alterTable(table, (builder) => {
            const b = builder.string(column, options.length);
            if (options.nullable === true) {
                b.nullable();
            }
            if (options.nullable === false) {
                b.notNullable();
            }
            if (options.default !== undefined) {
                b.defaultTo(options.default);
            }
            b.alter();
        });
    }
    async changeToTypeByCopy(table, column, options, cb) {
        await this.knex.schema.alterTable(table, (builder) => {
            const col = cb(builder, `${column}__temp`, options);
            if (options.default !== undefined) {
                col.defaultTo(options.default);
            }
            // Force new temporary column to be nullable (required, as there will already be rows in
            // the table)
            col.nullable();
        });
        await this.knex(table).update(`${column}__temp`, this.knex.ref(column));
        await this.knex.schema.alterTable(table, (builder) => {
            builder.dropColumn(column);
        });
        await this.knex.schema.alterTable(table, (builder) => {
            builder.renameColumn(`${column}__temp`, column);
        });
        // We're altering the temporary column here. That starts nullable, so we only want to set it
        // to NOT NULL when applicable
        if (options.nullable === false) {
            await this.changeNullable(table, column, options.nullable);
        }
    }
}
exports.SchemaHelper = SchemaHelper;
