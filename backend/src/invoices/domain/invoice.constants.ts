export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 100000;
export const DEFAULT_TAX_RATE = '10';

/** Decimals accepted on input (SPEC A-4): rate and discount up to 4, tax rate up to 2. */
export const MAX_RATE_DECIMALS = 4;
export const MAX_AMOUNT_DECIMALS = 4;
export const MAX_TAX_RATE_DECIMALS = 2;

/** A tax rate is a percent: 0 to 100, and dividing by 100 turns it into a factor. */
export const MAX_TAX_RATE_PERCENT = 100;
export const PERCENT_DIVISOR = 100;
export const PERCENT_DECIMALS = 2;

export const ZERO_AMOUNT = '0';
