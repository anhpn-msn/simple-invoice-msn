import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { INVOICE_STATUSES } from '../domain';
import type { InvoiceStatus } from '../domain';
import { IsIsoDateString, IsOnOrAfter, trim } from './validators';
import {
  DEFAULT_ORDERING,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT_FIELD,
  KEYWORD_MAX_LENGTH,
  KEYWORD_MIN_LENGTH,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  MIN_PAGE,
  MIN_PAGE_SIZE,
} from '../invoices.constants';

export const SORT_FIELDS = ['invoiceDate', 'dueDate', 'totalAmount'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const ORDERINGS = ['ASC', 'DESC'] as const;
export type Ordering = (typeof ORDERINGS)[number];

/** Only plain digits become numbers; "1e2", " 5" or "5.0" stay strings and fail IsInt. */
const toStrictInteger = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d{1,9}$/.test(value) ? Number(value) : value;

const toUpperCase = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.toUpperCase() : value;

export class ListInvoicesQueryDto {
  @ApiPropertyOptional({
    default: DEFAULT_PAGE,
    minimum: MIN_PAGE,
    maximum: MAX_PAGE,
  })
  @Transform(toStrictInteger)
  @IsOptional()
  @IsInt()
  @Min(MIN_PAGE)
  @Max(MAX_PAGE)
  page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    default: DEFAULT_PAGE_SIZE,
    minimum: MIN_PAGE_SIZE,
    maximum: MAX_PAGE_SIZE,
  })
  @Transform(toStrictInteger)
  @IsOptional()
  @IsInt()
  @Min(MIN_PAGE_SIZE)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ enum: SORT_FIELDS, default: DEFAULT_SORT_FIELD })
  @IsOptional()
  @IsIn(SORT_FIELDS, {
    message: `sortBy must be one of: ${SORT_FIELDS.join(', ')}`,
  })
  sortBy: SortField = DEFAULT_SORT_FIELD;

  @ApiPropertyOptional({
    enum: ORDERINGS,
    default: DEFAULT_ORDERING,
    description: 'Case-insensitive.',
  })
  @Transform(toUpperCase)
  @IsOptional()
  @IsIn(ORDERINGS, {
    message: `ordering must be one of: ${ORDERINGS.join(', ')}`,
  })
  ordering: Ordering = DEFAULT_ORDERING;

  @ApiPropertyOptional({
    enum: INVOICE_STATUSES,
    description:
      'Filters on the effective status: Overdue is derived from the due date and the business date.',
  })
  @IsOptional()
  @IsIn(INVOICE_STATUSES, {
    message: `status must be one of: ${INVOICE_STATUSES.join(', ')}`,
  })
  status?: InvoiceStatus;

  @ApiPropertyOptional({
    minLength: KEYWORD_MIN_LENGTH,
    maxLength: KEYWORD_MAX_LENGTH,
    description:
      'Case-insensitive partial match on invoice number or customer name.',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(KEYWORD_MIN_LENGTH, KEYWORD_MAX_LENGTH)
  keyword?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Inclusive, on invoiceDate.',
  })
  @IsOptional()
  @IsIsoDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Inclusive, on invoiceDate. Must be on or after fromDate.',
  })
  @IsOptional()
  @IsIsoDateString()
  @IsOnOrAfter('fromDate')
  toDate?: string;
}
