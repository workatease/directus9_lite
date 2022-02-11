"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSnapshot = void 0;
const database_1 = __importDefault(require("../database"));
const get_schema_1 = require("./get-schema");
const services_1 = require("../services");
const package_json_1 = require("../../package.json");
const lodash_1 = require("lodash");
async function getSnapshot(options) {
    var _a, _b;
    const database = (_a = options === null || options === void 0 ? void 0 : options.database) !== null && _a !== void 0 ? _a : (0, database_1.default)();
    const schema = (_b = options === null || options === void 0 ? void 0 : options.schema) !== null && _b !== void 0 ? _b : (await (0, get_schema_1.getSchema)({ database }));
    const collectionsService = new services_1.CollectionsService({ knex: database, schema });
    const fieldsService = new services_1.FieldsService({ knex: database, schema });
    const relationsService = new services_1.RelationsService({ knex: database, schema });
    const [collections, fields, relations] = await Promise.all([
        collectionsService.readByQuery(),
        fieldsService.readAll(),
        relationsService.readAll(),
    ]);
    return {
        version: 1,
        directus: package_json_1.version,
        collections: collections.filter((item) => excludeSystem(item)),
        fields: fields.filter((item) => excludeSystem(item)).map(omitID),
        relations: relations.filter((item) => excludeSystem(item)).map(omitID),
    };
}
exports.getSnapshot = getSnapshot;
function excludeSystem(item) {
    var _a;
    if (((_a = item === null || item === void 0 ? void 0 : item.meta) === null || _a === void 0 ? void 0 : _a.system) === true)
        return false;
    return true;
}
function omitID(item) {
    return (0, lodash_1.omit)(item, 'meta.id');
}
