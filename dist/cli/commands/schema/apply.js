"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = void 0;
const chalk_1 = __importDefault(require("chalk"));
const fs_1 = require("fs");
const inquirer_1 = __importDefault(require("inquirer"));
const js_yaml_1 = require("js-yaml");
const path_1 = __importDefault(require("path"));
const database_1 = __importStar(require("../../../database"));
const logger_1 = __importDefault(require("../../../logger"));
const get_snapshot_1 = require("../../../utils/get-snapshot");
const get_snapshot_diff_1 = require("../../../utils/get-snapshot-diff");
const apply_snapshot_1 = require("../../../utils/apply-snapshot");
const cache_1 = require("../../../cache");
async function apply(snapshotPath, options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const filename = path_1.default.resolve(process.cwd(), snapshotPath);
    const database = (0, database_1.default)();
    await (0, database_1.validateDatabaseConnection)(database);
    await (0, cache_1.flushCaches)();
    if ((await (0, database_1.isInstalled)()) === false) {
        logger_1.default.error(`Directus isn't installed on this database. Please run "directus bootstrap" first.`);
        database.destroy();
        process.exit(0);
    }
    let snapshot;
    try {
        const fileContents = await fs_1.promises.readFile(filename, 'utf8');
        if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
            snapshot = (await (0, js_yaml_1.load)(fileContents));
        }
        else {
            snapshot = JSON.parse(fileContents);
        }
        const currentSnapshot = await (0, get_snapshot_1.getSnapshot)({ database });
        const snapshotDiff = (0, get_snapshot_diff_1.getSnapshotDiff)(currentSnapshot, snapshot);
        if (snapshotDiff.collections.length === 0 &&
            snapshotDiff.fields.length === 0 &&
            snapshotDiff.relations.length === 0) {
            logger_1.default.info('No changes to apply.');
            database.destroy();
            process.exit(0);
        }
        if ((options === null || options === void 0 ? void 0 : options.yes) !== true) {
            let message = '';
            if (snapshotDiff.collections.length > 0) {
                message += chalk_1.default.black.underline.bold('Collections:');
                for (const { collection, diff } of snapshotDiff.collections) {
                    if (((_a = diff[0]) === null || _a === void 0 ? void 0 : _a.kind) === 'E') {
                        message += `\n  - ${chalk_1.default.blue('Update')} ${collection}`;
                        for (const change of diff) {
                            if (change.kind === 'E') {
                                const path = change.path.slice(1).join('.');
                                message += `\n    - Set ${path} to ${change.rhs}`;
                            }
                        }
                    }
                    else if (((_b = diff[0]) === null || _b === void 0 ? void 0 : _b.kind) === 'D') {
                        message += `\n  - ${chalk_1.default.red('Delete')} ${collection}`;
                    }
                    else if (((_c = diff[0]) === null || _c === void 0 ? void 0 : _c.kind) === 'N') {
                        message += `\n  - ${chalk_1.default.green('Create')} ${collection}`;
                    }
                    else if (((_d = diff[0]) === null || _d === void 0 ? void 0 : _d.kind) === 'A') {
                        message += `\n  - ${chalk_1.default.blue('Update')} ${collection}`;
                    }
                }
            }
            if (snapshotDiff.fields.length > 0) {
                message += '\n\n' + chalk_1.default.black.underline.bold('Fields:');
                for (const { collection, field, diff } of snapshotDiff.fields) {
                    if (((_e = diff[0]) === null || _e === void 0 ? void 0 : _e.kind) === 'E') {
                        message += `\n  - ${chalk_1.default.blue('Update')} ${collection}.${field}`;
                        for (const change of diff) {
                            if (change.kind === 'E') {
                                const path = change.path.slice(1).join('.');
                                message += `\n    - Set ${path} to ${change.rhs}`;
                            }
                        }
                    }
                    else if (((_f = diff[0]) === null || _f === void 0 ? void 0 : _f.kind) === 'D') {
                        message += `\n  - ${chalk_1.default.red('Delete')} ${collection}.${field}`;
                    }
                    else if (((_g = diff[0]) === null || _g === void 0 ? void 0 : _g.kind) === 'N') {
                        message += `\n  - ${chalk_1.default.green('Create')} ${collection}.${field}`;
                    }
                    else if (((_h = diff[0]) === null || _h === void 0 ? void 0 : _h.kind) === 'A') {
                        message += `\n  - ${chalk_1.default.blue('Update')} ${collection}.${field}`;
                    }
                }
            }
            if (snapshotDiff.relations.length > 0) {
                message += '\n\n' + chalk_1.default.black.underline.bold('Relations:');
                for (const { collection, field, related_collection, diff } of snapshotDiff.relations) {
                    if (((_j = diff[0]) === null || _j === void 0 ? void 0 : _j.kind) === 'E') {
                        message += `\n  - ${chalk_1.default.blue('Update')} ${collection}.${field}`;
                        for (const change of diff) {
                            if (change.kind === 'E') {
                                const path = change.path.slice(1).join('.');
                                message += `\n    - Set ${path} to ${change.rhs}`;
                            }
                        }
                    }
                    else if (((_k = diff[0]) === null || _k === void 0 ? void 0 : _k.kind) === 'D') {
                        message += `\n  - ${chalk_1.default.red('Delete')} ${collection}.${field}`;
                    }
                    else if (((_l = diff[0]) === null || _l === void 0 ? void 0 : _l.kind) === 'N') {
                        message += `\n  - ${chalk_1.default.green('Create')} ${collection}.${field}`;
                    }
                    else if (((_m = diff[0]) === null || _m === void 0 ? void 0 : _m.kind) === 'A') {
                        message += `\n  - ${chalk_1.default.blue('Update')} ${collection}.${field}`;
                    }
                    else {
                        continue;
                    }
                    // Related collection doesn't exist for a2o relationship types
                    if (related_collection) {
                        message += `-> ${related_collection}`;
                    }
                }
            }
            const { proceed } = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'proceed',
                    message: 'The following changes will be applied:\n\n' +
                        chalk_1.default.black(message) +
                        '\n\n' +
                        'Would you like to continue?',
                },
            ]);
            if (proceed === false) {
                process.exit(0);
            }
        }
        await (0, apply_snapshot_1.applySnapshot)(snapshot, { current: currentSnapshot, diff: snapshotDiff, database });
        logger_1.default.info(`Snapshot applied successfully`);
        database.destroy();
        process.exit(0);
    }
    catch (err) {
        logger_1.default.error(err);
        database.destroy();
        process.exit(1);
    }
}
exports.apply = apply;
