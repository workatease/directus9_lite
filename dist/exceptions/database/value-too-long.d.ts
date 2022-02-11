import { BaseException } from '@directus/shared/exceptions';
declare type Extensions = {
    collection: string;
    field: string | null;
};
export declare class ValueTooLongException extends BaseException {
    constructor(field: string | null, extensions?: Extensions);
}
export {};
