import { Router } from 'express';
import { Client } from 'ldapjs';
import { AuthDriver } from '../auth';
import { AuthDriverOptions, User } from '../../types';
import { UsersService } from '../../services';
export declare class LDAPAuthDriver extends AuthDriver {
    bindClient: Client;
    usersService: UsersService;
    config: Record<string, any>;
    constructor(options: AuthDriverOptions, config: Record<string, any>);
    private validateBindClient;
    private fetchUserDn;
    private fetchUserInfo;
    private fetchUserGroups;
    private fetchUserId;
    getUserID(payload: Record<string, any>): Promise<string>;
    verify(user: User, password?: string): Promise<void>;
    login(user: User, payload: Record<string, any>): Promise<void>;
    refresh(user: User): Promise<void>;
}
export declare function createLDAPAuthRouter(provider: string): Router;
