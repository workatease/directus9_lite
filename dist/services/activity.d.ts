import { AbstractServiceOptions, PrimaryKey, Item } from '../types';
import { ItemsService } from './items';
import { MutationOptions } from '../types';
import { NotificationsService } from './notifications';
import { UsersService } from './users';
export declare class ActivityService extends ItemsService {
    notificationsService: NotificationsService;
    usersService: UsersService;
    constructor(options: AbstractServiceOptions);
    createOne(data: Partial<Item>, opts?: MutationOptions): Promise<PrimaryKey>;
}
