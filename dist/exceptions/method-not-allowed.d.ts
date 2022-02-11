import { BaseException } from '@directus/shared/exceptions';
declare type Extensions = {
    allow: string[];
};
export declare class MethodNotAllowedException extends BaseException {
    constructor(message: string | undefined, extensions: Extensions);
}
export {};
