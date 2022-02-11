import { Snapshot, SnapshotDiff } from '../types';
import { Knex } from 'knex';
import { SchemaOverview } from '@directus/shared/types';
export declare function applySnapshot(snapshot: Snapshot, options?: {
    database?: Knex;
    schema?: SchemaOverview;
    current?: Snapshot;
    diff?: SnapshotDiff;
}): Promise<void>;
