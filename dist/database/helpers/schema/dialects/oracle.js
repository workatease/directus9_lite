"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaHelperOracle = void 0;
const types_1 = require("../types");
class SchemaHelperOracle extends types_1.SchemaHelper {
    async changeToText(table, column, options = {}) {
        await this.changeToTypeByCopy(table, column, options, (builder, column) => builder.text(column));
    }
    async changeToString(table, column, options = {}) {
        await this.changeToTypeByCopy(table, column, options, (builder, column, options) => builder.string(column, options.length));
    }
}
exports.SchemaHelperOracle = SchemaHelperOracle;
