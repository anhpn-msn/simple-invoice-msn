import { existsSync } from 'node:fs';

/**
 * Loads `.env` into process.env for entry points that run outside Nest
 * (migration runner, seed). Variables already set in the environment win.
 */
export function loadEnvFile(path = '.env'): void {
  if (process.env.NODE_ENV !== 'test' && existsSync(path)) {
    process.loadEnvFile(path);
  }
}
