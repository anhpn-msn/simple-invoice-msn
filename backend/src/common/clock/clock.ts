import { Injectable } from '@nestjs/common';
import type { Clock } from './clock.types';

/** Injection token for the active `Clock`. */
export const CLOCK = Symbol('CLOCK');

/** Production clock backed by the system time. */
@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Test clock with a settable instant. */
export class FixedClock implements Clock {
  private instant: Date;

  constructor(instant: Date | string) {
    this.instant = new Date(instant);
  }

  now(): Date {
    return new Date(this.instant);
  }

  set(instant: Date | string): void {
    this.instant = new Date(instant);
  }
}
