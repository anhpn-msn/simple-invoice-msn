import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AppConfigService } from '../config/app-config.service';
import {
  DB_CONNECTION_TIMEOUT_MS,
  DB_IDLE_TIMEOUT_MS,
  DB_STATEMENT_TIMEOUT_MS,
} from './database.constants';
import * as schema from './schema';
import type { Database } from './database.types';

/** Injection token for the Drizzle client: `@Inject(DRIZZLE) db: Database`. */
export const DRIZZLE = Symbol('DRIZZLE');
/** Injection token for the underlying node-postgres pool (rarely needed). */
export const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): Pool => {
        const pool = new Pool({
          connectionString: config.get('databaseUrl'),
          connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
          idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
          // PostgreSQL enforces it and cancels the statement. pg's client-side
          // query_timeout is not used: it only rejects the promise in Node and
          // leaves the statement running on the server.
          statement_timeout: DB_STATEMENT_TIMEOUT_MS,
        });
        // An idle client error must not crash the process.
        pool.on('error', (error) =>
          new Logger('DatabasePool').error(
            `Idle client error: ${error.message}`,
          ),
        );
        return pool;
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
  ],
  exports: [DRIZZLE, PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
