import { Knex } from 'knex';
import * as dateHelpers from './date';
import * as geometryHelpers from './geometry';
import * as schemaHelpers from './schema';
export declare function getHelpers(database: Knex): {
    date: dateHelpers.postgres | dateHelpers.oracle | dateHelpers.sqlite | dateHelpers.mysql | dateHelpers.mssql;
    st: geometryHelpers.postgres | geometryHelpers.redshift | geometryHelpers.oracle | geometryHelpers.sqlite | geometryHelpers.mysql | geometryHelpers.mssql;
    schema: schemaHelpers.postgres | schemaHelpers.cockroachdb | schemaHelpers.oracle;
};
export declare type Helpers = ReturnType<typeof getHelpers>;
