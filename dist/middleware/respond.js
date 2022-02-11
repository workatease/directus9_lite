"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.respond = void 0;
const json2csv_1 = require("json2csv");
const ms_1 = __importDefault(require("ms"));
const stream_1 = require("stream");
const cache_1 = require("../cache");
const env_1 = __importDefault(require("../env"));
const async_handler_1 = __importDefault(require("../utils/async-handler"));
const get_cache_key_1 = require("../utils/get-cache-key");
const js2xmlparser_1 = require("js2xmlparser");
const get_cache_headers_1 = require("../utils/get-cache-headers");
const logger_1 = __importDefault(require("../logger"));
exports.respond = (0, async_handler_1.default)(async (req, res) => {
    var _a, _b, _c;
    const { cache } = (0, cache_1.getCache)();
    if (req.method.toLowerCase() === 'get' &&
        env_1.default.CACHE_ENABLED === true &&
        cache &&
        !req.sanitizedQuery.export &&
        res.locals.cache !== false) {
        const key = (0, get_cache_key_1.getCacheKey)(req);
        try {
            await cache.set(key, res.locals.payload, (0, ms_1.default)(env_1.default.CACHE_TTL));
            await cache.set(`${key}__expires_at`, Date.now() + (0, ms_1.default)(env_1.default.CACHE_TTL));
        }
        catch (err) {
            logger_1.default.warn(err, `[cache] Couldn't set key ${key}. ${err}`);
        }
        res.setHeader('Cache-Control', (0, get_cache_headers_1.getCacheControlHeader)(req, (0, ms_1.default)(env_1.default.CACHE_TTL)));
        res.setHeader('Vary', 'Origin, Cache-Control');
    }
    else {
        // Don't cache anything by default
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Vary', 'Origin, Cache-Control');
    }
    if (req.sanitizedQuery.export) {
        let filename = '';
        if (req.collection) {
            filename += req.collection;
        }
        else {
            filename += 'Export';
        }
        filename += ' ' + getDateFormatted();
        if (req.sanitizedQuery.export === 'json') {
            res.attachment(`${filename}.json`);
            res.set('Content-Type', 'application/json');
            return res.status(200).send(JSON.stringify(((_a = res.locals.payload) === null || _a === void 0 ? void 0 : _a.data) || null, null, '\t'));
        }
        if (req.sanitizedQuery.export === 'xml') {
            res.attachment(`${filename}.xml`);
            res.set('Content-Type', 'text/xml');
            return res.status(200).send((0, js2xmlparser_1.parse)('data', (_b = res.locals.payload) === null || _b === void 0 ? void 0 : _b.data));
        }
        if (req.sanitizedQuery.export === 'csv') {
            res.attachment(`${filename}.csv`);
            res.set('Content-Type', 'text/csv');
            const stream = new stream_1.PassThrough();
            if (!((_c = res.locals.payload) === null || _c === void 0 ? void 0 : _c.data) || res.locals.payload.data.length === 0) {
                stream.end(Buffer.from(''));
                return stream.pipe(res);
            }
            else {
                stream.end(Buffer.from(JSON.stringify(res.locals.payload.data), 'utf-8'));
                const json2csv = new json2csv_1.Transform({
                    transforms: [json2csv_1.transforms.flatten({ separator: '.' })],
                });
                return stream.pipe(json2csv).pipe(res);
            }
        }
    }
    if (Buffer.isBuffer(res.locals.payload)) {
        return res.end(res.locals.payload);
    }
    else if (res.locals.payload) {
        return res.json(res.locals.payload);
    }
    else {
        return res.status(204).end();
    }
});
function getDateFormatted() {
    const date = new Date();
    let month = String(date.getMonth() + 1);
    if (month.length === 1)
        month = '0' + month;
    let day = String(date.getDate());
    if (day.length === 1)
        day = '0' + day;
    return `${date.getFullYear()}-${month}-${day} at ${date.getHours()}.${date.getMinutes()}.${date.getSeconds()}`;
}
