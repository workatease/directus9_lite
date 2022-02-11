import Keyv from 'keyv';
export declare function getCache(): {
    cache: Keyv | null;
    systemCache: Keyv;
};
export declare function flushCaches(): Promise<void>;
