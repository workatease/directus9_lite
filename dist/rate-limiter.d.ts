import { IRateLimiterOptions, IRateLimiterStoreOptions, RateLimiterAbstract } from 'rate-limiter-flexible';
declare type IRateLimiterOptionsOverrides = Partial<IRateLimiterOptions> | Partial<IRateLimiterStoreOptions>;
export declare function createRateLimiter(configOverrides?: IRateLimiterOptionsOverrides): RateLimiterAbstract;
export {};
