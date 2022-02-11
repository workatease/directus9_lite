"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ms_1 = __importDefault(require("ms"));
const env_1 = __importDefault(require("../env"));
const exceptions_1 = require("../exceptions");
const use_collection_1 = __importDefault(require("../middleware/use-collection"));
const services_1 = require("../services");
const async_handler_1 = __importDefault(require("../utils/async-handler"));
const router = (0, express_1.Router)();
router.use((0, use_collection_1.default)('directus_files'));
router.get('/:pk', 
// Return file
(0, async_handler_1.default)(async (req, res) => {
    var _a, _b;
    const id = (_a = req.params.pk) === null || _a === void 0 ? void 0 : _a.substring(0, 36);
    const service = new services_1.AssetsService({
        accountability: req.accountability,
        schema: req.schema,
    });
    let range = undefined;
    if (req.headers.range) {
        // substring 6 = "bytes="
        const rangeParts = req.headers.range.substring(6).split('-');
        range = {
            start: rangeParts[0] ? Number(rangeParts[0]) : 0,
            end: rangeParts[1] ? Number(rangeParts[1]) : undefined,
        };
        if (Number.isNaN(range.start) || Number.isNaN(range.end)) {
            throw new exceptions_1.RangeNotSatisfiableException(range);
        }
    }
    const { stream, file, stat } = await service.getAsset(id, range);
    const access = ((_b = req.accountability) === null || _b === void 0 ? void 0 : _b.role) ? 'private' : 'public';
    res.attachment(file.filename_download);
    res.setHeader('Content-Type', file.type);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', `${access}, max-age=${(0, ms_1.default)(env_1.default.ASSETS_CACHE_TTL) / 1000}`);
    if (range) {
        res.setHeader('Content-Range', `bytes ${range.start}-${range.end || stat.size - 1}/${stat.size}`);
        res.status(206);
        res.setHeader('Content-Length', (range.end ? range.end + 1 : stat.size) - range.start);
    }
    else {
        res.setHeader('Content-Length', stat.size);
    }
    if ('download' in req.query === false) {
        res.removeHeader('Content-Disposition');
    }
    if (req.method.toLowerCase() === 'head') {
        res.status(200);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', stat.size);
        return res.end();
    }
    stream.pipe(res);
}));
exports.default = router;
