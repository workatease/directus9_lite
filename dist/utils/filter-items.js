"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterItems = void 0;
const generate_joi_1 = __importDefault(require("./generate-joi"));
/*
 Note: Filtering is normally done through SQL in run-ast. This function can be used in case an already
 existing array of items has to be filtered using the same filter syntax as used in the ast-to-sql flow
 */
function filterItems(items, filter) {
    if (!filter)
        return items;
    return items.filter((item) => {
        return passesFilter(item, filter);
    });
    function passesFilter(item, filter) {
        if (!filter)
            return true;
        if (Object.keys(filter)[0] === '_and') {
            const subfilter = Object.values(filter)[0];
            return subfilter.every((subFilter) => {
                return passesFilter(item, subFilter);
            });
        }
        else if (Object.keys(filter)[0] === '_or') {
            const subfilter = Object.values(filter)[0];
            return subfilter.some((subFilter) => {
                return passesFilter(item, subFilter);
            });
        }
        else {
            const schema = (0, generate_joi_1.default)(filter);
            const { error } = schema.validate(item);
            return error === undefined;
        }
    }
}
exports.filterItems = filterItems;
