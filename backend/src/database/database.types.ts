import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;
/** The transaction handle passed to `db.transaction(async (tx) => ...)`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything a repository can run queries on: the client or a transaction. */
export type DbExecutor = Database | Transaction;
