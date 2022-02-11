"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getColumn = void 0;
const helpers_1 = require("../database/helpers");
const constants_1 = require("@directus/shared/constants");
const apply_function_to_column_name_1 = require("./apply-function-to-column-name");
/**
 * Return column prefixed by table. If column includes functions (like `year(date_created)`, the
 * column is replaced with the appropriate SQL)
 *
 * @param knex Current knex / transaction instance
 * @param collection Collection or alias in which column resides
 * @param field name of the column
 * @param alias Whether or not to add a SQL AS statement
 * @returns Knex raw instance
 */
function getColumn(knex, table, column, alias = (0, apply_function_to_column_name_1.applyFunctionToColumnName)(column)) {
    const { date: fn } = (0, helpers_1.getHelpers)(knex);
    if (column.includes('(') && column.includes(')')) {
        const functionName = column.split('(')[0];
        const columnName = column.match(constants_1.REGEX_BETWEEN_PARENS)[1];
        if (functionName in fn) {
            const result = fn[functionName](table, columnName);
            if (alias) {
                return knex.raw(result + ' AS ??', [alias]);
            }
            return result;
        }
        else {
            throw new Error(`Invalid function specified "${functionName}"`);
        }
    }
    if (alias && column !== alias) {
        return knex.ref(`${table}.${column}`).as(alias);
    }
    return knex.ref(`${table}.${column}`);
}
exports.getColumn = getColumn;
