import { Query } from '@directus/shared/types';
import { Accountability } from '@directus/shared/types';
export declare function sanitizeQuery(rawQuery: Record<string, any>, accountability?: Accountability | null): Query;
