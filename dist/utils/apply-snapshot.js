"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applySnapshot = void 0;
const get_snapshot_1 = require("./get-snapshot");
const get_snapshot_diff_1 = require("./get-snapshot-diff");
const database_1 = __importDefault(require("../database"));
const get_schema_1 = require("./get-schema");
const services_1 = require("../services");
const lodash_1 = require("lodash");
const logger_1 = __importDefault(require("../logger"));
async function applySnapshot(snapshot, options) {
    var _a, _b, _c, _d;
    const database = (_a = options === null || options === void 0 ? void 0 : options.database) !== null && _a !== void 0 ? _a : (0, database_1.default)();
    const schema = (_b = options === null || options === void 0 ? void 0 : options.schema) !== null && _b !== void 0 ? _b : (await (0, get_schema_1.getSchema)({ database }));
    const current = (_c = options === null || options === void 0 ? void 0 : options.current) !== null && _c !== void 0 ? _c : (await (0, get_snapshot_1.getSnapshot)({ database, schema }));
    const snapshotDiff = (_d = options === null || options === void 0 ? void 0 : options.diff) !== null && _d !== void 0 ? _d : (0, get_snapshot_diff_1.getSnapshotDiff)(current, snapshot);
    await database.transaction(async (trx) => {
        const collectionsService = new services_1.CollectionsService({ knex: trx, schema });
        for (const { collection, diff } of snapshotDiff.collections) {
            if ((diff === null || diff === void 0 ? void 0 : diff[0].kind) === 'D') {
                try {
                    await collectionsService.deleteOne(collection);
                }
                catch (err) {
                    logger_1.default.error(`Failed to delete collection "${collection}"`);
                    throw err;
                }
            }
            if ((diff === null || diff === void 0 ? void 0 : diff[0].kind) === 'N' && diff[0].rhs) {
                // We'll nest the to-be-created fields in the same collection creation, to prevent
                // creating a collection without a primary key
                const fields = snapshotDiff.fields
                    .filter((fieldDiff) => fieldDiff.collection === collection)
                    .map((fieldDiff) => fieldDiff.diff[0].rhs);
                try {
                    await collectionsService.createOne({
                        ...diff[0].rhs,
                        fields,
                    });
                }
                catch (err) {
                    logger_1.default.error(`Failed to create collection "${collection}"`);
                    throw err;
                }
                // Now that the fields are in for this collection, we can strip them from the field
                // edits
                snapshotDiff.fields = snapshotDiff.fields.filter((fieldDiff) => fieldDiff.collection !== collection);
            }
            if ((diff === null || diff === void 0 ? void 0 : diff[0].kind) === 'E' || (diff === null || diff === void 0 ? void 0 : diff[0].kind) === 'A') {
                const newValues = snapshot.collections.find((field) => {
                    return field.collection === collection;
                });
                if (newValues) {
                    try {
                        await collectionsService.updateOne(collection, newValues);
                    }
                    catch (err) {
                        logger_1.default.error(`Failed to update collection "${collection}"`);
                        throw err;
                    }
                }
            }
        }
        const fieldsService = new services_1.FieldsService({ knex: trx, schema: await (0, get_schema_1.getSchema)({ database: trx }) });
        for (const { collection, field, diff } of snapshotDiff.fields) {
            if ((diff === null || diff === void 0 ? void 0 : diff[0].kind) === 'N') {
                try {
                    await fieldsService.createField(collection, diff[0].rhs);
                }
                catch (err) {
                    logger_1.default.error(`Failed to create field "${collection}.${field}"`);
                    throw err;
                }
            }
            if ((diff === null || diff === void 0 ? void 0 : diff[0].kind) === 'E' || (diff === null || diff === void 0 ? void 0 : diff[0].kind) === 'A') {
                const newValues = snapshot.fields.find((snapshotField) => {
                    return snapshotField.collection === collection && snapshotField.field === field;
                });
                if (newValues) {
                    try {
                        await fieldsService.updateField(collection, {
                            ...newValues,
                        });
                    }
                    catch (err) {
                        logger_1.default.error(`Failed to update field "${collection}.${field}"`);
                        throw err;
                    }
                }
            }
            if ((diff === null || diff === void 0 ? void 0 : diff[0].kind) === 'D') {
                try {
                    await fieldsService.deleteField(collection, field);
                }
                catch (err) {
                    logger_1.default.error(`Failed to delete field "${collection}.${field}"`);
                    throw err;
                }
                // Field deletion also cleans up the relationship. We should ignore any relationship
                // changes attached to this now non-existing field
                snapshotDiff.relations = snapshotDiff.relations.filter((relation) => (relation.collection === collection && relation.field === field) === false);
            }
        }
        const relationsService = new services_1.RelationsService({ knex: trx, schema: await (0, get_schema_1.getSchema)({ database: trx }) });
        for (const { collection, field, diff } of snapshotDiff.relations) {
            const structure = {};
            for (const diffEdit of diff) {
                (0, lodash_1.set)(structure, diffEdit.path, undefined);
            }
            if ((diff === null || diff === void 0 ? void 0 : diff[0].kind) === 'N') {
                try {
                    await relationsService.createOne(diff[0].rhs);
                }
                catch (err) {
                    logger_1.default.error(`Failed to create relation "${collection}.${field}"`);
                    throw err;
                }
            }
            if ((diff === null || diff === void 0 ? void 0 : diff[0].kind) === 'E' || (diff === null || diff === void 0 ? void 0 : diff[0].kind) === 'A') {
                const newValues = snapshot.relations.find((relation) => {
                    return relation.collection === collection && relation.field === field;
                });
                if (newValues) {
                    try {
                        await relationsService.updateOne(collection, field, newValues);
                    }
                    catch (err) {
                        logger_1.default.error(`Failed to update relation "${collection}.${field}"`);
                        throw err;
                    }
                }
            }
            if ((diff === null || diff === void 0 ? void 0 : diff[0].kind) === 'D') {
                try {
                    await relationsService.deleteOne(collection, field);
                }
                catch (err) {
                    logger_1.default.error(`Failed to delete relation "${collection}.${field}"`);
                    throw err;
                }
            }
        }
    });
}
exports.applySnapshot = applySnapshot;
