"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetsService = void 0;
const database_1 = __importDefault(require("../database"));
const exceptions_1 = require("../exceptions");
const storage_1 = __importDefault(require("../storage"));
const authorization_1 = require("./authorization");
const uuid_validate_1 = __importDefault(require("uuid-validate"));
class AssetsService {
    constructor(options) {
        this.knex = options.knex || (0, database_1.default)();
        this.accountability = options.accountability || null;
        this.authorizationService = new authorization_1.AuthorizationService(options);
    }
    async getAsset(id, range) {
        var _a;
        const publicSettings = await this.knex
            .select('project_logo', 'public_background', 'public_foreground')
            .from('directus_settings')
            .first();
        const systemPublicKeys = Object.values(publicSettings || {});
        /**
         * This is a little annoying. Postgres will error out if you're trying to search in `where`
         * with a wrong type. In case of directus_files where id is a uuid, we'll have to verify the
         * validity of the uuid ahead of time.
         */
        const isValidUUID = (0, uuid_validate_1.default)(id, 4);
        if (isValidUUID === false)
            throw new exceptions_1.ForbiddenException();
        if (systemPublicKeys.includes(id) === false && ((_a = this.accountability) === null || _a === void 0 ? void 0 : _a.admin) !== true) {
            await this.authorizationService.checkAccess('read', 'directus_files', id);
        }
        const file = (await this.knex.select('*').from('directus_files').where({ id }).first());
        if (!file)
            throw new exceptions_1.ForbiddenException();
        const { exists } = await storage_1.default.disk(file.storage).exists(file.filename_disk);
        if (!exists)
            throw new exceptions_1.ForbiddenException();
        if (range) {
            if (range.start >= file.filesize || (range.end && range.end >= file.filesize)) {
                throw new exceptions_1.RangeNotSatisfiableException(range);
            }
        }
        const readStream = storage_1.default.disk(file.storage).getStream(file.filename_disk, range);
        const stat = await storage_1.default.disk(file.storage).getStat(file.filename_disk);
        return { stream: readStream, file, stat };
    }
}
exports.AssetsService = AssetsService;
