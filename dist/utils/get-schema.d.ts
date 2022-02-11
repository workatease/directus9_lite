import { Knex } from 'knex';
import { Accountability, SchemaOverview } from '@directus/shared/types';
export declare function getSchema(options?: {
    accountability?: Accountability;
    database?: Knex;
}): Promise<SchemaOverview>;
