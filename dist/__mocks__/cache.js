"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCache = exports.cache = void 0;
exports.cache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(true),
};
exports.getCache = jest.fn().mockReturnValue({ cache: exports.cache });
