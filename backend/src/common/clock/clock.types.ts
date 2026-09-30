/** Source of the current instant; the only place business code may read time from. */
export interface Clock {
  now(): Date;
}
