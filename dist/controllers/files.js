"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const format_title_1 = __importDefault(require("@directus/format-title"));
const busboy_1 = __importDefault(require("busboy"));
const express_1 = __importDefault(require("express"));
const joi_1 = __importDefault(require("joi"));
const path_1 = __importDefault(require("path"));
const env_1 = __importDefault(require("../env"));
const exceptions_1 = require("../exceptions");
const respond_1 = require("../middleware/respond");
const use_collection_1 = __importDefault(require("../middleware/use-collection"));
const validate_batch_1 = require("../middleware/validate-batch");
const services_1 = require("../services");
const async_handler_1 = __importDefault(require("../utils/async-handler"));
const utils_1 = require("@directus/shared/utils");
const router = express_1.default.Router();
router.use((0, use_collection_1.default)('directus_files'));
const multipartHandler = (0, async_handler_1.default)(async (req, res, next) => {
    if (req.is('multipart/form-data') === false)
        return next();
    let headers;
    if (req.headers['content-type']) {
        headers = req.headers;
    }
    else {
        headers = {
            ...req.headers,
            'content-type': 'application/octet-stream',
        };
    }
    const busboy = new busboy_1.default({ headers });
    const savedFiles = [];
    const service = new services_1.FilesService({ accountability: req.accountability, schema: req.schema });
    const existingPrimaryKey = req.params.pk || undefined;
    /**
     * The order of the fields in multipart/form-data is important. We require that all fields
     * are provided _before_ the files. This allows us to set the storage location, and create
     * the row in directus_files async during the upload of the actual file.
     */
    let disk = (0, utils_1.toArray)(env_1.default.STORAGE_LOCATIONS)[0];
    let payload = {};
    let fileCount = 0;
    busboy.on('field', (fieldname, val) => {
        let fieldValue = val;
        if (typeof fieldValue === 'string' && fieldValue.trim() === 'null')
            fieldValue = null;
        if (typeof fieldValue === 'string' && fieldValue.trim() === 'false')
            fieldValue = false;
        if (typeof fieldValue === 'string' && fieldValue.trim() === 'true')
            fieldValue = true;
        if (fieldname === 'storage') {
            disk = val;
        }
        payload[fieldname] = fieldValue;
    });
    busboy.on('file', async (fieldname, fileStream, filename, encoding, mimetype) => {
        fileCount++;
        if (!payload.title) {
            payload.title = (0, format_title_1.default)(path_1.default.parse(filename).name);
        }
        const payloadWithRequiredFields = {
            ...payload,
            filename_download: filename,
            type: mimetype,
            storage: payload.storage || disk,
        };
        // Clear the payload for the next to-be-uploaded file
        payload = {};
        try {
            const primaryKey = await service.uploadOne(fileStream, payloadWithRequiredFields, existingPrimaryKey);
            savedFiles.push(primaryKey);
            tryDone();
        }
        catch (error) {
            busboy.emit('error', error);
        }
    });
    busboy.on('error', (error) => {
        next(error);
    });
    busboy.on('finish', () => {
        tryDone();
    });
    req.pipe(busboy);
    function tryDone() {
        if (savedFiles.length === fileCount) {
            res.locals.savedFiles = savedFiles;
            return next();
        }
    }
});
router.post('/', multipartHandler, (0, async_handler_1.default)(async (req, res, next) => {
    if (req.is('multipart/form-data') === false) {
        throw new exceptions_1.UnsupportedMediaTypeException(`Unsupported Content-Type header`);
    }
    const service = new services_1.FilesService({
        accountability: req.accountability,
        schema: req.schema,
    });
    let keys = [];
    if (req.is('multipart/form-data')) {
        keys = res.locals.savedFiles;
    }
    else {
        keys = await service.createOne(req.body);
    }
    try {
        if (Array.isArray(keys) && keys.length > 1) {
            const records = await service.readMany(keys, req.sanitizedQuery);
            res.locals.payload = {
                data: records,
            };
        }
        else {
            const key = Array.isArray(keys) ? keys[0] : keys;
            const record = await service.readOne(key, req.sanitizedQuery);
            res.locals.payload = {
                data: record,
            };
        }
    }
    catch (error) {
        if (error instanceof exceptions_1.ForbiddenException) {
            return next();
        }
        throw error;
    }
    return next();
}), respond_1.respond);
const importSchema = joi_1.default.object({
    url: joi_1.default.string().required(),
    data: joi_1.default.object(),
});
router.post('/import', (0, async_handler_1.default)(async (req, res, next) => {
    const { error } = importSchema.validate(req.body);
    if (error) {
        throw new exceptions_1.InvalidPayloadException(error.message);
    }
    const service = new services_1.FilesService({
        accountability: req.accountability,
        schema: req.schema,
    });
    const primaryKey = await service.importOne(req.body.url, req.body.data);
    try {
        const record = await service.readOne(primaryKey, req.sanitizedQuery);
        res.locals.payload = { data: record || null };
    }
    catch (error) {
        if (error instanceof exceptions_1.ForbiddenException) {
            return next();
        }
        throw error;
    }
    return next();
}), respond_1.respond);
const readHandler = (0, async_handler_1.default)(async (req, res, next) => {
    const service = new services_1.FilesService({
        accountability: req.accountability,
        schema: req.schema,
    });
    const metaService = new services_1.MetaService({
        accountability: req.accountability,
        schema: req.schema,
    });
    let result;
    if (req.singleton) {
        result = await service.readSingleton(req.sanitizedQuery);
    }
    else if (req.body.keys) {
        result = await service.readMany(req.body.keys, req.sanitizedQuery);
    }
    else {
        result = await service.readByQuery(req.sanitizedQuery);
    }
    const meta = await metaService.getMetaForQuery('directus_files', req.sanitizedQuery);
    res.locals.payload = { data: result, meta };
    return next();
});
router.get('/', (0, validate_batch_1.validateBatch)('read'), readHandler, respond_1.respond);
router.search('/', (0, validate_batch_1.validateBatch)('read'), readHandler, respond_1.respond);
router.get('/:pk', (0, async_handler_1.default)(async (req, res, next) => {
    const service = new services_1.FilesService({
        accountability: req.accountability,
        schema: req.schema,
    });
    const record = await service.readOne(req.params.pk, req.sanitizedQuery);
    res.locals.payload = { data: record || null };
    return next();
}), respond_1.respond);
router.patch('/', (0, validate_batch_1.validateBatch)('update'), (0, async_handler_1.default)(async (req, res, next) => {
    const service = new services_1.FilesService({
        accountability: req.accountability,
        schema: req.schema,
    });
    let keys = [];
    if (req.body.keys) {
        keys = await service.updateMany(req.body.keys, req.body.data);
    }
    else {
        keys = await service.updateByQuery(req.body.query, req.body.data);
    }
    try {
        const result = await service.readMany(keys, req.sanitizedQuery);
        res.locals.payload = { data: result || null };
    }
    catch (error) {
        if (error instanceof exceptions_1.ForbiddenException) {
            return next();
        }
        throw error;
    }
    return next();
}), respond_1.respond);
router.patch('/:pk', multipartHandler, (0, async_handler_1.default)(async (req, res, next) => {
    const service = new services_1.FilesService({
        accountability: req.accountability,
        schema: req.schema,
    });
    await service.updateOne(req.params.pk, req.body);
    try {
        const record = await service.readOne(req.params.pk, req.sanitizedQuery);
        res.locals.payload = { data: record || null };
    }
    catch (error) {
        if (error instanceof exceptions_1.ForbiddenException) {
            return next();
        }
        throw error;
    }
    return next();
}), respond_1.respond);
router.delete('/', (0, validate_batch_1.validateBatch)('delete'), (0, async_handler_1.default)(async (req, res, next) => {
    const service = new services_1.FilesService({
        accountability: req.accountability,
        schema: req.schema,
    });
    if (Array.isArray(req.body)) {
        await service.deleteMany(req.body);
    }
    else if (req.body.keys) {
        await service.deleteMany(req.body.keys);
    }
    else {
        await service.deleteByQuery(req.body.query);
    }
    return next();
}), respond_1.respond);
router.delete('/:pk', (0, async_handler_1.default)(async (req, res, next) => {
    const service = new services_1.FilesService({
        accountability: req.accountability,
        schema: req.schema,
    });
    await service.deleteOne(req.params.pk);
    return next();
}), respond_1.respond);
exports.default = router;
