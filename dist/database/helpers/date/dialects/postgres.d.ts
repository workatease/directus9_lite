import { DateHelper } from '../types';
import { Knex } from 'knex';
export declare class DateHelperPostgres extends DateHelper {
    year(table: string, column: string): Knex.Raw;
    month(table: string, column: string): Knex.Raw;
    week(table: string, column: string): Knex.Raw;
    day(table: string, column: string): Knex.Raw;
    weekday(table: string, column: string): Knex.Raw;
    hour(table: string, column: string): Knex.Raw;
    minute(table: string, column: string): Knex.Raw;
    second(table: string, column: string): Knex.Raw;
}
