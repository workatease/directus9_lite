import { Collection } from './collection';
import { Relation, RelationMeta, Field, FieldMeta } from '@directus/shared/types';
import { Diff } from 'deep-diff';
export declare type Snapshot = {
    version: number;
    directus: string;
    collections: Collection[];
    fields: SnapshotField[];
    relations: SnapshotRelation[];
};
export declare type SnapshotField = Field & {
    meta: Omit<FieldMeta, 'id'>;
};
export declare type SnapshotRelation = Relation & {
    meta: Omit<RelationMeta, 'id'>;
};
export declare type SnapshotDiff = {
    collections: {
        collection: string;
        diff: Diff<Collection | undefined>[];
    }[];
    fields: {
        collection: string;
        field: string;
        diff: Diff<SnapshotField | undefined>[];
    }[];
    relations: {
        collection: string;
        field: string;
        related_collection: string | null;
        diff: Diff<SnapshotRelation | undefined>[];
    }[];
};
