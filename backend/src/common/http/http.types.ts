import type { Request } from 'express';

/** Express request carrying the id assigned by the request-id middleware. */
export type RequestWithId = Request & { id?: unknown };
