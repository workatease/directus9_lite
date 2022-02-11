import { DatabaseHelper } from '../types';
import { Knex } from 'knex';
declare type Clients = 'mysql' | 'postgres' | 'cockroachdb' | 'sqlite' | 'oracle' | 'mssql' | 'redshift';
export declare abstract class SchemaHelper extends DatabaseHelper {
    isOneOfClients(clients: Clients[]): boolean;
    changeNullable(table: string, column: string, nullable: boolean): Promise<void>;
    changeToText(table: string, column: string, options?: {
        nullable?: boolean;
        default?: any;
    }): Promise<void>;
    changeToInteger(table: string, column: string, options?: {
        nullable?: boolean;
        default?: any;
    }): Promise<void>;
    changeToString(table: string, column: string, options?: {
        nullable?: boolean;
        default?: any;
        length?: number;
    }): Promise<void>;
    protected changeToTypeByCopy<Options extends {
        nullable?: boolean;
        default?: any;
    }>(table: string, column: string, options: Options, cb: (builder: Knex.CreateTableBuilder, column: string, options: Options) => Knex.ColumnBuilder): Promise<void>;
}
export {};
