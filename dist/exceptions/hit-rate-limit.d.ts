import { BaseException } from '@directus/shared/exceptions';
declare type Extensions = {
    limit: number;
    reset: Date;
};
export declare class HitRateLimitException extends BaseException {
    constructor(message: string, extensions: Extensions);
}
export {};
