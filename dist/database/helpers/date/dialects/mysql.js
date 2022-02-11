"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateHelperMySQL = void 0;
const types_1 = require("../types");
class DateHelperMySQL extends types_1.DateHelper {
    year(table, column) {
        return this.knex.raw('YEAR(??.??)', [table, column]);
    }
    month(table, column) {
        return this.knex.raw('MONTH(??.??)', [table, column]);
    }
    week(table, column) {
        return this.knex.raw('WEEK(??.??)', [table, column]);
    }
    day(table, column) {
        return this.knex.raw('DAYOFMONTH(??.??)', [table, column]);
    }
    weekday(table, column) {
        return this.knex.raw('DAYOFWEEK(??.??)', [table, column]);
    }
    hour(table, column) {
        return this.knex.raw('HOUR(??.??)', [table, column]);
    }
    minute(table, column) {
        return this.knex.raw('MINUTE(??.??)', [table, column]);
    }
    second(table, column) {
        return this.knex.raw('SECOND(??.??)', [table, column]);
    }
}
exports.DateHelperMySQL = DateHelperMySQL;
