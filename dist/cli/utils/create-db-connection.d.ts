import { Knex } from 'knex';
export declare type Credentials = {
    filename?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean;
    options__encrypt?: boolean;
};
export default function createDBConnection(client: 'sqlite3' | 'mysql' | 'pg' | 'oracledb' | 'mssql' | 'cockroachdb', credentials: Credentials): Knex<any, unknown[]>;
