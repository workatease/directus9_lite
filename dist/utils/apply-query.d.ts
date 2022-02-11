import { Knex } from 'knex';
import { Aggregate, Filter, Query, SchemaOverview } from '@directus/shared/types';
/**
 * Apply the Query to a given Knex query builder instance
 */
export default function applyQuery(knex: Knex, collection: string, dbQuery: Knex.QueryBuilder, query: Query, schema: SchemaOverview, subQuery?: boolean): Knex.QueryBuilder;
export declare function applyFilter(knex: Knex, schema: SchemaOverview, rootQuery: Knex.QueryBuilder, rootFilter: Filter, collection: string, subQuery?: boolean): Knex.QueryBuilder<any, any>;
export declare function applySearch(schema: SchemaOverview, dbQuery: Knex.QueryBuilder, searchQuery: string, collection: string): Promise<void>;
export declare function applyAggregate(dbQuery: Knex.QueryBuilder, aggregate: Aggregate, collection: string): void;
