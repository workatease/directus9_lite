import { SchemaOverview } from '@directus/shared/types';
import { Knex } from 'knex';
export interface AuthDriverOptions {
    knex: Knex;
    schema: SchemaOverview;
}
export interface User {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    password: string | null;
    status: 'active' | 'suspended' | 'invited';
    role: string | null;
    provider: string;
    external_identifier: string | null;
    auth_data: string | Record<string, unknown> | null;
    app_access: boolean;
    admin_access: boolean;
}
export declare type AuthData = Record<string, any> | null;
export interface Session {
    token: string;
    expires: Date;
    share: string;
}
export declare type DirectusTokenPayload = {
    id?: string;
    role: string | null;
    app_access: boolean | number;
    admin_access: boolean | number;
    share?: string;
    share_scope?: {
        collection: string;
        item: string;
    };
};
export declare type ShareData = {
    share_id: string;
    share_role: string;
    share_item: string;
    share_collection: string;
    share_start: Date;
    share_end: Date;
    share_times_used: number;
    share_max_uses?: number;
    share_password?: string;
};
export declare type LoginResult = {
    accessToken: any;
    refreshToken: any;
    expires: any;
    id?: any;
};