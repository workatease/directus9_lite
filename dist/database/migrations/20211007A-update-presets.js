"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = void 0;
const nanoid_1 = require("nanoid");
async function up(knex) {
    var _a;
    await knex.schema.alterTable('directus_presets', (table) => {
        table.json('filter');
    });
    const presets = await knex
        .select('id', 'filters', 'layout_query')
        .from('directus_presets');
    for (const preset of presets) {
        if (preset.filters) {
            const oldFilters = (_a = (typeof preset.filters === 'string' ? JSON.parse(preset.filters) : preset.filters)) !== null && _a !== void 0 ? _a : [];
            if (oldFilters.length === 0)
                continue;
            const newFilter = {
                _and: [],
            };
            for (const oldFilter of oldFilters) {
                if (oldFilter.key === 'hide-archived')
                    continue;
                newFilter._and.push({
                    [oldFilter.field]: {
                        ['_' + oldFilter.operator]: oldFilter.value,
                    },
                });
            }
            if (newFilter._and.length > 0) {
                await knex('directus_presets')
                    .update({ filter: JSON.stringify(newFilter) })
                    .where('id', '=', preset.id);
            }
        }
        if (preset.layout_query) {
            const layoutQuery = typeof preset.layout_query === 'string' ? JSON.parse(preset.layout_query) : preset.layout_query;
            for (const [layout, query] of Object.entries(layoutQuery)) {
                if (query.sort) {
                    query.sort = [query.sort];
                }
                layoutQuery[layout] = query;
            }
            await knex('directus_presets')
                .update({ layout_query: JSON.stringify(layoutQuery) })
                .where('id', '=', preset.id);
        }
    }
    await knex.schema.alterTable('directus_presets', (table) => {
        table.dropColumn('filters');
    });
}
exports.up = up;
async function down(knex) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    await knex.schema.alterTable('directus_presets', (table) => {
        table.json('filters');
    });
    const presets = await knex
        .select('id', 'filter', 'layout_query')
        .from('directus_presets');
    for (const preset of presets) {
        if (preset.filter) {
            const newFilter = (_a = (typeof preset.filter === 'string' ? JSON.parse(preset.filter) : preset.filter)) !== null && _a !== void 0 ? _a : {};
            if (Object.keys(newFilter).length === 0)
                continue;
            const oldFilters = [];
            for (const filter of (_b = newFilter._and) !== null && _b !== void 0 ? _b : []) {
                const field = (_c = Object.keys(filter)) === null || _c === void 0 ? void 0 : _c[0];
                const operator = (_f = Object.keys((_e = (_d = Object.values(filter)) === null || _d === void 0 ? void 0 : _d[0]) !== null && _e !== void 0 ? _e : {})) === null || _f === void 0 ? void 0 : _f[0];
                const value = (_j = Object.values((_h = (_g = Object.values(filter)) === null || _g === void 0 ? void 0 : _g[0]) !== null && _h !== void 0 ? _h : {})) === null || _j === void 0 ? void 0 : _j[0];
                if (!field || !operator || !value)
                    continue;
                oldFilters.push({
                    key: (0, nanoid_1.nanoid)(),
                    field,
                    operator: operator.substring(1),
                    value,
                });
            }
            if (oldFilters.length > 0) {
                await knex('directus_presets')
                    .update({ filters: JSON.stringify(oldFilters) })
                    .where('id', '=', preset.id);
            }
        }
        if (preset.layout_query) {
            const layoutQuery = typeof preset.layout_query === 'string' ? JSON.parse(preset.layout_query) : preset.layout_query;
            for (const [layout, query] of Object.entries(layoutQuery)) {
                if (query.sort && Array.isArray(query.sort)) {
                    query.sort = (_l = (_k = query.sort) === null || _k === void 0 ? void 0 : _k[0]) !== null && _l !== void 0 ? _l : null;
                }
                layoutQuery[layout] = query;
            }
            await knex('directus_presets')
                .update({ layout_query: JSON.stringify(layoutQuery) })
                .where('id', '=', preset.id);
        }
    }
    await knex.schema.alterTable('directus_presets', (table) => {
        table.dropColumn('filter');
    });
}
exports.down = down;
