"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateHelperSQLite = void 0;
const types_1 = require("../types");
class DateHelperSQLite extends types_1.DateHelper {
    year(table, column) {
        return this.knex.raw("strftime('%Y', ??.?? / 1000, 'unixepoch')", [table, column]);
    }
    month(table, column) {
        return this.knex.raw("strftime('%m', ??.?? / 1000, 'unixepoch')", [table, column]);
    }
    week(table, column) {
        return this.knex.raw("strftime('%W', ??.?? / 1000, 'unixepoch')", [table, column]);
    }
    day(table, column) {
        return this.knex.raw("strftime('%d', ??.?? / 1000, 'unixepoch')", [table, column]);
    }
    weekday(table, column) {
        return this.knex.raw("strftime('%w', ??.?? / 1000, 'unixepoch')", [table, column]);
    }
    hour(table, column) {
        return this.knex.raw("strftime('%H', ??.?? / 1000, 'unixepoch')", [table, column]);
    }
    minute(table, column) {
        return this.knex.raw("strftime('%M', ??.?? / 1000, 'unixepoch')", [table, column]);
    }
    second(table, column) {
        return this.knex.raw("strftime('%S', ??.?? / 1000, 'unixepoch')", [table, column]);
    }
    parse(date) {
        const newDate = new Date(date);
        return (newDate.getTime() - newDate.getTimezoneOffset() * 60 * 1000).toString();
    }
}
exports.DateHelperSQLite = DateHelperSQLite;
