import { SchemaOverview } from '@directus/schema/dist/types/overview';
import { Column } from 'knex-schema-inspector/dist/types/column';
import { FieldMeta, Type } from '@directus/shared/types';
export default function getLocalType(column?: SchemaOverview[string]['columns'][string] | Column, field?: {
    special?: FieldMeta['special'];
}): Type | 'unknown';
