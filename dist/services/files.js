"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilesService = void 0;
const format_title_1 = __importDefault(require("@directus/format-title"));
const axios_1 = __importDefault(require("axios"));
const exifr_1 = __importDefault(require("exifr"));
const lodash_1 = require("lodash");
const mime_types_1 = require("mime-types");
const path_1 = __importDefault(require("path"));
const url_1 = __importDefault(require("url"));
const emitter_1 = __importDefault(require("../emitter"));
const env_1 = __importDefault(require("../env"));
const exceptions_1 = require("../exceptions");
const logger_1 = __importDefault(require("../logger"));
const storage_1 = __importDefault(require("../storage"));
const utils_1 = require("@directus/shared/utils");
const items_1 = require("./items");
class FilesService extends items_1.ItemsService {
    constructor(options) {
        super('directus_files', options);
    }
    /**
     * Upload a single new file to the configured storage adapter
     */
    async uploadOne(stream, data, primaryKey, opts) {
        var _a, _b, _c, _d, _e, _f;
        const payload = (0, lodash_1.clone)(data);
        if ('folder' in payload === false) {
            const settings = await this.knex.select('storage_default_folder').from('directus_settings').first();
            if (settings === null || settings === void 0 ? void 0 : settings.storage_default_folder) {
                payload.folder = settings.storage_default_folder;
            }
        }
        if (primaryKey !== undefined) {
            await this.updateOne(primaryKey, payload, { emitEvents: false });
            // If the file you're uploading already exists, we'll consider this upload a replace. In that case, we'll
            // delete the previously saved file and thumbnails to ensure they're generated fresh
            const disk = storage_1.default.disk(payload.storage);
            for await (const file of disk.flatList(String(primaryKey))) {
                await disk.delete(file.path);
            }
        }
        else {
            primaryKey = await this.createOne(payload, { emitEvents: false });
        }
        const fileExtension = path_1.default.extname(payload.filename_download) || (payload.type && '.' + (0, mime_types_1.extension)(payload.type)) || '';
        payload.filename_disk = primaryKey + (fileExtension || '');
        if (!payload.type) {
            payload.type = 'application/octet-stream';
        }
        try {
            await storage_1.default.disk(data.storage).put(payload.filename_disk, stream, payload.type);
        }
        catch (err) {
            logger_1.default.warn(`Couldn't save file ${payload.filename_disk}`);
            logger_1.default.warn(err);
            throw new exceptions_1.ServiceUnavailableException(`Couldn't save file ${payload.filename_disk}`, { service: 'files' });
        }
        const { size } = await storage_1.default.disk(data.storage).getStat(payload.filename_disk);
        payload.filesize = size;
        if (['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff'].includes(payload.type)) {
            const buffer = await storage_1.default.disk(data.storage).getBuffer(payload.filename_disk);
            // try {
            // 	const meta = await sharp(buffer.content, {}).metadata();
            // 	if (meta.orientation && meta.orientation >= 5) {
            // 		payload.height = meta.width;
            // 		payload.width = meta.height;
            // 	} else {
            // 		payload.width = meta.width;
            // 		payload.height = meta.height;
            // 	}
            // } catch (err: any) {
            // 	logger.warn(`Couldn't extract sharp metadata from file`);
            // 	logger.warn(err);
            // }
            payload.metadata = {};
            try {
                payload.metadata = await exifr_1.default.parse(buffer.content, {
                    icc: false,
                    iptc: true,
                    ifd1: true,
                    interop: true,
                    translateValues: true,
                    reviveValues: true,
                    mergeOutput: false,
                });
                if ((_b = (_a = payload.metadata) === null || _a === void 0 ? void 0 : _a.iptc) === null || _b === void 0 ? void 0 : _b.Headline) {
                    payload.title = payload.metadata.iptc.Headline;
                }
                if (!payload.description && ((_d = (_c = payload.metadata) === null || _c === void 0 ? void 0 : _c.iptc) === null || _d === void 0 ? void 0 : _d.Caption)) {
                    payload.description = payload.metadata.iptc.Caption;
                }
                if ((_f = (_e = payload.metadata) === null || _e === void 0 ? void 0 : _e.iptc) === null || _f === void 0 ? void 0 : _f.Keywords) {
                    payload.tags = payload.metadata.iptc.Keywords;
                }
            }
            catch (err) {
                logger_1.default.warn(`Couldn't extract EXIF metadata from file`);
                logger_1.default.warn(err);
            }
        }
        // We do this in a service without accountability. Even if you don't have update permissions to the file,
        // we still want to be able to set the extracted values from the file on create
        const sudoService = new items_1.ItemsService('directus_files', {
            knex: this.knex,
            schema: this.schema,
        });
        await sudoService.updateOne(primaryKey, payload, { emitEvents: false });
        if (this.cache && env_1.default.CACHE_AUTO_PURGE) {
            await this.cache.clear();
        }
        if ((opts === null || opts === void 0 ? void 0 : opts.emitEvents) !== false) {
            emitter_1.default.emitAction('files.upload', {
                payload,
                key: primaryKey,
                collection: this.collection,
            }, {
                database: this.knex,
                schema: this.schema,
                accountability: this.accountability,
            });
        }
        return primaryKey;
    }
    /**
     * Import a single file from an external URL
     */
    async importOne(importURL, body) {
        var _a, _b, _c;
        const fileCreatePermissions = (_b = (_a = this.accountability) === null || _a === void 0 ? void 0 : _a.permissions) === null || _b === void 0 ? void 0 : _b.find((permission) => permission.collection === 'directus_files' && permission.action === 'create');
        if (this.accountability && ((_c = this.accountability) === null || _c === void 0 ? void 0 : _c.admin) !== true && !fileCreatePermissions) {
            throw new exceptions_1.ForbiddenException();
        }
        let fileResponse;
        try {
            fileResponse = await axios_1.default.get(importURL, {
                responseType: 'stream',
            });
        }
        catch (err) {
            logger_1.default.warn(`Couldn't fetch file from url "${importURL}"`);
            logger_1.default.warn(err);
            throw new exceptions_1.ServiceUnavailableException(`Couldn't fetch file from url "${importURL}"`, {
                service: 'external-file',
            });
        }
        const parsedURL = url_1.default.parse(fileResponse.request.res.responseUrl);
        const filename = path_1.default.basename(parsedURL.pathname);
        const payload = {
            filename_download: filename,
            storage: (0, utils_1.toArray)(env_1.default.STORAGE_LOCATIONS)[0],
            type: fileResponse.headers['content-type'],
            title: (0, format_title_1.default)(filename),
            ...(body || {}),
        };
        return await this.uploadOne(fileResponse.data, payload);
    }
    /**
     * Delete a file
     */
    async deleteOne(key, opts) {
        await this.deleteMany([key], opts);
        return key;
    }
    /**
     * Delete multiple files
     */
    async deleteMany(keys, opts) {
        const files = await super.readMany(keys, { fields: ['id', 'storage'], limit: -1 });
        if (!files) {
            throw new exceptions_1.ForbiddenException();
        }
        await super.deleteMany(keys);
        for (const file of files) {
            const disk = storage_1.default.disk(file.storage);
            // Delete file + thumbnails
            for await (const { path } of disk.flatList(file.id)) {
                await disk.delete(path);
            }
        }
        if (this.cache && env_1.default.CACHE_AUTO_PURGE && (opts === null || opts === void 0 ? void 0 : opts.autoPurgeCache) !== false) {
            await this.cache.clear();
        }
        return keys;
    }
}
exports.FilesService = FilesService;
