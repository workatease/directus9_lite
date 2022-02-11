import { Table } from 'knex-schema-inspector/dist/types/table';
import { Field } from '@directus/shared/types';
export declare type CollectionMeta = {
    collection: string;
    note: string | null;
    hidden: boolean;
    singleton: boolean;
    icon: string | null;
    translations: Record<string, string>;
    item_duplication_fields: string[] | null;
    accountability: 'all' | 'accountability' | null;
    group: string | null;
};
export declare type Collection = {
    collection: string;
    fields?: Field[];
    meta: CollectionMeta | null;
    schema: Table | null;
};
