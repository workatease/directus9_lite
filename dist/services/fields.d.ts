import SchemaInspector from '@directus/schema';
import { Knex } from 'knex';
import { Column } from 'knex-schema-inspector/dist/types/column';
import { ItemsService } from '../services/items';
import { PayloadService } from '../services/payload';
import { AbstractServiceOptions } from '../types';
import { Field, RawField, Type, Accountability, SchemaOverview } from '@directus/shared/types';
import { Helpers } from '../database/helpers';
import Keyv from 'keyv';
export declare class FieldsService {
    knex: Knex;
    helpers: Helpers;
    accountability: Accountability | null;
    itemsService: ItemsService;
    payloadService: PayloadService;
    schemaInspector: ReturnType<typeof SchemaInspector>;
    schema: SchemaOverview;
    cache: Keyv<any> | null;
    systemCache: Keyv<any>;
    constructor(options: AbstractServiceOptions);
    private get hasReadAccess();
    readAll(collection?: string): Promise<Field[]>;
    readOne(collection: string, field: string): Promise<Record<string, any>>;
    createField(collection: string, field: Partial<Field> & {
        field: string;
        type: Type | null;
    }, table?: Knex.CreateTableBuilder): Promise<void>;
    updateField(collection: string, field: RawField): Promise<string>;
    deleteField(collection: string, field: string): Promise<void>;
    addColumnToTable(table: Knex.CreateTableBuilder, field: RawField | Field, alter?: Column | null): void;
}
