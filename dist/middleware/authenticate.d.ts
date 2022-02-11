import { RequestHandler } from 'express';
/**
 * Verify the passed JWT and assign the user ID and role to `req`
 */
declare const authenticate: RequestHandler;
export default authenticate;
