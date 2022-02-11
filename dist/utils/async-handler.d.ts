import { ErrorRequestHandler, RequestHandler } from 'express';
/**
 * Handles promises in routes.
 */
declare function asyncHandler(handler: RequestHandler): RequestHandler;
declare function asyncHandler(handler: ErrorRequestHandler): ErrorRequestHandler;
export default asyncHandler;
