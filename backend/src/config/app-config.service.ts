import { Injectable } from '@nestjs/common';
import type { AppConfig } from './config.types';

/**
 * Typed read-only access to the validated configuration:
 * `config.get('jwtAccessTtlSeconds')` or `config.values.jwtAccessTtlSeconds`.
 */
@Injectable()
export class AppConfigService {
  constructor(readonly values: Readonly<AppConfig>) {}

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.values[key];
  }
}
