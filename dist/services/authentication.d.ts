import { Knex } from 'knex';
import { ActivityService } from './activity';
import { AbstractServiceOptions, LoginResult } from '../types';
import { Accountability, SchemaOverview } from '@directus/shared/types';
export declare class AuthenticationService {
    knex: Knex;
    accountability: Accountability | null;
    activityService: ActivityService;
    schema: SchemaOverview;
    constructor(options: AbstractServiceOptions);
    /**
     * Retrieve the tokens for a given user email.
     *
     * Password is optional to allow usage of this function within the SSO flow and extensions. Make sure
     * to handle password existence checks elsewhere
     */
    login(providerName: string | undefined, payload: Record<string, any>, otp?: string): Promise<LoginResult>;
    refresh(refreshToken: string): Promise<Record<string, any>>;
    logout(refreshToken: string): Promise<void>;
    verifyPassword(userID: string, password: string): Promise<void>;
}
