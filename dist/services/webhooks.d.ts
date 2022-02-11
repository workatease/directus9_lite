import { AbstractServiceOptions, Item, PrimaryKey, Webhook, MutationOptions } from '../types';
import { ItemsService } from './items';
export declare class WebhooksService extends ItemsService<Webhook> {
    constructor(options: AbstractServiceOptions);
    createOne(data: Partial<Item>, opts?: MutationOptions): Promise<PrimaryKey>;
    createMany(data: Partial<Item>[], opts?: MutationOptions): Promise<PrimaryKey[]>;
    updateOne(key: PrimaryKey, data: Partial<Item>, opts?: MutationOptions): Promise<PrimaryKey>;
    updateMany(keys: PrimaryKey[], data: Partial<Item>, opts?: MutationOptions): Promise<PrimaryKey[]>;
    deleteOne(key: PrimaryKey, opts?: MutationOptions): Promise<PrimaryKey>;
    deleteMany(keys: PrimaryKey[], opts?: MutationOptions): Promise<PrimaryKey[]>;
}
