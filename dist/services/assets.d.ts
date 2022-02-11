/// <reference types="node" />
import { Range, StatResponse } from '@directus/drive';
import { Knex } from 'knex';
import { AbstractServiceOptions } from '../types';
import { Accountability } from '@directus/shared/types';
import { AuthorizationService } from './authorization';
export declare class AssetsService {
    knex: Knex;
    accountability: Accountability | null;
    authorizationService: AuthorizationService;
    constructor(options: AbstractServiceOptions);
    getAsset(id: string, range?: Range): Promise<{
        stream: NodeJS.ReadableStream;
        file: any;
        stat: StatResponse;
    }>;
}
