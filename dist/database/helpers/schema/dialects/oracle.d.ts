import { SchemaHelper } from '../types';
export declare class SchemaHelperOracle extends SchemaHelper {
    changeToText(table: string, column: string, options?: {
        nullable?: boolean;
        default?: any;
    }): Promise<void>;
    changeToString(table: string, column: string, options?: {
        nullable?: boolean;
        default?: any;
        length?: number;
    }): Promise<void>;
}
