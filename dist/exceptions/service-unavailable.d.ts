import { BaseException } from '@directus/shared/exceptions';
declare type Extensions = {
    service: string;
    [key: string]: any;
};
export declare class ServiceUnavailableException extends BaseException {
    constructor(message: string, extensions: Extensions);
}
export {};
