import { RequestHandler } from 'express';
export declare const validateBatch: (scope: 'read' | 'update' | 'delete') => RequestHandler;
