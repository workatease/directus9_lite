import { BaseException } from '@directus/shared/exceptions';
declare type Exceptions = {
    collection: string;
    field: string | null;
    invalid?: string;
};
export declare class ValueOutOfRangeException extends BaseException {
    constructor(field: string | null, exceptions?: Exceptions);
}
export {};
