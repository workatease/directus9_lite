"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RangeNotSatisfiableException = void 0;
const exceptions_1 = require("@directus/shared/exceptions");
class RangeNotSatisfiableException extends exceptions_1.BaseException {
    constructor(range) {
        super(`Range "${range.start}-${range.end}" is invalid or the file's size doesn't match the requested range.`, 416, 'RANGE_NOT_SATISFIABLE');
    }
}
exports.RangeNotSatisfiableException = RangeNotSatisfiableException;
