export declare type MSSQLError = {
    message: string;
    code: 'EREQUEST';
    number: number;
    state: number;
    class: number;
    serverName: string;
    procName: string;
    lineNumber: number;
};
export declare type MySQLError = {
    message: string;
    code: string;
    errno: number;
    sqlMessage: string;
    sqlState: string;
    index: number;
    sql: string;
};
export declare type PostgresError = {
    message: string;
    length: number;
    code: string;
    detail: string;
    schema: string;
    table: string;
    column?: string;
    dataType?: string;
    constraint?: string;
};
export declare type OracleError = {
    message: string;
    errorNum: number;
    offset: number;
};
export declare type SQLiteError = {
    message: string;
    errno: number;
    code: string;
};
export declare type SQLError = MSSQLError & MySQLError & PostgresError & SQLiteError & OracleError & Error;
