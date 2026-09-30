import {
  type ValidationArguments,
  type ValidationOptions,
  registerDecorator,
} from 'class-validator';
import type { TransformFnParams } from 'class-transformer';
import { Dec, isIsoDate, parseDecimalString } from '../domain';
import type { DecimalStringOptions } from '../invoices.types';

/** Trims strings and leaves any other type for the validators to reject. */
export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Like `trim`, but an empty result means "not provided" for optional fields. */
export const trimToUndefined = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export const trimAndLowercase = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Real calendar date in strict `YYYY-MM-DD` form (rejects 2026-02-30). */
export function IsIsoDateString(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isIsoDateString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isIsoDate(value),
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be a real date in YYYY-MM-DD format`,
      },
    });
  };
}

/**
 * The decorated date must be the same day or later than the sibling property.
 * Skips silently when either side is not a valid date; the date-format
 * validator reports that case, so the client gets one clear message.
 */
export function IsOnOrAfter(
  siblingProperty: string,
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isOnOrAfter',
      target: object.constructor,
      propertyName,
      constraints: [siblingProperty],
      options: validationOptions,
      validator: {
        validate: (value: unknown, args: ValidationArguments) => {
          const [siblingName] = args.constraints as [string];
          const sibling = (args.object as Record<string, unknown>)[siblingName];
          if (!isIsoDate(value) || !isIsoDate(sibling)) return true;
          return value >= sibling;
        },
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be on or after ${String(args.constraints[0])}`,
      },
    });
  };
}

function decimalStringError(
  value: unknown,
  field: string,
  options: DecimalStringOptions,
): string | null {
  try {
    const parsed = parseDecimalString(value as string, {
      maxDecimals: options.maxDecimals,
      allowZero: options.allowZero,
      field,
    });
    if (options.max !== undefined && parsed.gt(new Dec(options.max))) {
      return `${field} must not exceed ${options.max}`;
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : `${field} is invalid`;
  }
}

/**
 * Money and rate fields are decimal strings (SPEC A-4), never JSON numbers.
 * Delegates to the domain parser so DTO and calculator share one definition.
 */
export function IsDecimalString(
  options: DecimalStringOptions,
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isDecimalString',
      target: object.constructor,
      propertyName,
      constraints: [options],
      options: validationOptions,
      validator: {
        validate: (value: unknown, args: ValidationArguments) =>
          decimalStringError(value, args.property, options) === null,
        defaultMessage: (args: ValidationArguments) =>
          decimalStringError(args.value, args.property, options) ??
          `${args.property} is invalid`,
      },
    });
  };
}
