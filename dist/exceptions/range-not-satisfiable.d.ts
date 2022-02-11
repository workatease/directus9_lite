import { Range } from '@directus/drive';
import { BaseException } from '@directus/shared/exceptions';
export declare class RangeNotSatisfiableException extends BaseException {
    constructor(range: Range);
}
