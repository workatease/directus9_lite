import { Router } from 'express';
import { AppExtensionType, ExtensionType } from '@directus/shared/types';
export declare function getExtensionManager(): ExtensionManager;
declare type Options = {
    schedule: boolean;
    watch: boolean;
};
declare class ExtensionManager {
    private isLoaded;
    private options;
    private extensions;
    private appExtensions;
    private apiExtensions;
    private apiEmitter;
    private endpointRouter;
    private watcher;
    constructor();
    initialize(options?: Partial<Options>): Promise<void>;
    reload(): Promise<void>;
    getExtensionsList(type?: ExtensionType): string[];
    getAppExtensions(type: AppExtensionType): string | undefined;
    getEndpointRouter(): Router;
    private load;
    private unload;
    private initializeWatcher;
    private updateWatchedExtensions;
    private getExtensions;
    private generateExtensionBundles;
    private getSharedDepsMapping;
    private registerHooks;
    private registerEndpoints;
    private registerHook;
    private registerEndpoint;
    private unregisterHooks;
    private unregisterEndpoints;
}
export {};
