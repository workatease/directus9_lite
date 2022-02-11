import { Knex } from 'knex';
/**
 * Return column prefixed by table. If column includes functions (like `year(date_created)`, the
 * column is replaced with the appropriate SQL)
 *
 * @param knex Current knex / transaction instance
 * @param collection Collection or alias in which column resides
 * @param field name of the column
 * @param alias Whether or not to add a SQL AS statement
 * @returns Knex raw instance
 */
export declare function getColumn(knex: Knex, table: string, column: string, alias?: string | false): Knex.Raw;
