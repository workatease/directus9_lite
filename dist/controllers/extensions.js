"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const async_handler_1 = __importDefault(require("../utils/async-handler"));
const exceptions_1 = require("../exceptions");
const extensions_1 = require("../extensions");
const respond_1 = require("../middleware/respond");
const utils_1 = require("@directus/shared/utils");
const router = (0, express_1.Router)();
router.get('/:type', (0, async_handler_1.default)(async (req, res, next) => {
    const type = (0, utils_1.depluralize)(req.params.type);
    if (!(0, utils_1.isAppExtension)(type)) {
        throw new exceptions_1.RouteNotFoundException(req.path);
    }
    const extensionManager = (0, extensions_1.getExtensionManager)();
    const extensions = extensionManager.getExtensionsList(type);
    res.locals.payload = {
        data: extensions,
    };
    return next();
}), respond_1.respond);
router.get('/:type/index.js', (0, async_handler_1.default)(async (req, res) => {
    const type = (0, utils_1.depluralize)(req.params.type);
    if (!(0, utils_1.isAppExtension)(type)) {
        throw new exceptions_1.RouteNotFoundException(req.path);
    }
    const extensionManager = (0, extensions_1.getExtensionManager)();
    const extensionSource = extensionManager.getAppExtensions(type);
    if (extensionSource === undefined) {
        throw new exceptions_1.RouteNotFoundException(req.path);
    }
    res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin, Cache-Control');
    res.end(extensionSource);
}));
exports.default = router;
