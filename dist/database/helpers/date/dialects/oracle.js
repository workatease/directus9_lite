"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateHelperOracle = void 0;
const types_1 = require("../types");
class DateHelperOracle extends types_1.DateHelper {
    year(table, column) {
        return this.knex.raw("TO_CHAR(??.??, 'IYYY')", [table, column]);
    }
    month(table, column) {
        return this.knex.raw("TO_CHAR(??.??, 'MM')", [table, column]);
    }
    week(table, column) {
        return this.knex.raw("TO_CHAR(??.??, 'IW')", [table, column]);
    }
    day(table, column) {
        return this.knex.raw("TO_CHAR(??.??, 'DD')", [table, column]);
    }
    weekday(table, column) {
        return this.knex.raw("TO_CHAR(??.??, 'D')", [table, column]);
    }
    hour(table, column) {
        return this.knex.raw("TO_CHAR(??.??, 'HH24')", [table, column]);
    }
    minute(table, column) {
        return this.knex.raw("TO_CHAR(??.??, 'MI')", [table, column]);
    }
    second(table, column) {
        return this.knex.raw("TO_CHAR(??.??, 'SS')", [table, column]);
    }
}
exports.DateHelperOracle = DateHelperOracle;
