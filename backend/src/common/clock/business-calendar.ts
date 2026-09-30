import { Inject, Injectable } from '@nestjs/common';
import { toBusinessDate } from './business-date';
import { CLOCK } from './clock';
import type { Clock } from './clock.types';

/** Injection token for the IANA business time zone (SPEC A-6). */
export const BUSINESS_TIMEZONE = Symbol('BUSINESS_TIMEZONE');

/** Provides the business date ("today") in the configured time zone. */
@Injectable()
export class BusinessCalendar {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(BUSINESS_TIMEZONE) private readonly timeZone: string,
  ) {
    // Fail fast at startup on an invalid IANA name instead of on first request.
    toBusinessDate(this.clock.now(), this.timeZone);
  }

  /** Current business date as `YYYY-MM-DD`. */
  today(): string {
    return toBusinessDate(this.clock.now(), this.timeZone);
  }
}
