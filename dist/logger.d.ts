/// <reference types="qs" />
import { RequestHandler } from 'express';
import pino from 'pino';
declare const logger: pino.Logger;
export declare const expressLogger: RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
export default logger;
