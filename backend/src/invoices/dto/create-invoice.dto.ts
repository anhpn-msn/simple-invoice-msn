import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ADDRESS_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  FULLNAME_MAX_LENGTH,
  INVOICE_NUMBER_MAX_LENGTH,
  INVOICE_REFERENCE_MAX_LENGTH,
  ITEM_NAME_MAX_LENGTH,
  MOBILE_MAX_LENGTH,
} from '../../database/database.constants';
import {
  MAX_AMOUNT_DECIMALS,
  MAX_QUANTITY,
  MAX_RATE,
  MAX_RATE_DECIMALS,
  MAX_TAX_RATE_DECIMALS,
  MAX_TAX_RATE_PERCENT,
  MIN_QUANTITY,
  SUPPORTED_CURRENCIES,
} from '../domain';
import {
  IsDecimalString,
  IsIsoDateString,
  IsOnOrAfter,
  trim,
  trimAndLowercase,
  trimToUndefined,
} from './validators';

export const INVOICE_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-_/.#]*$/;
const MOBILE_PATTERN = /^\+?[0-9 ()-]{6,32}$/;

export class CustomerDto {
  @ApiProperty({
    example: 'Jane Doe',
    minLength: 1,
    maxLength: FULLNAME_MAX_LENGTH,
  })
  @Transform(trim)
  @IsString()
  @Length(1, FULLNAME_MAX_LENGTH)
  fullname!: string;

  @ApiProperty({
    example: 'jane@example.com',
    maxLength: EMAIL_MAX_LENGTH,
    description: 'Normalized to lowercase.',
  })
  @Transform(trimAndLowercase)
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @ApiPropertyOptional({
    example: '+61 400 000 000',
    pattern: MOBILE_PATTERN.source,
  })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(MOBILE_MAX_LENGTH)
  @Matches(MOBILE_PATTERN, {
    message:
      'mobileNumber must contain 6 to 32 digits, spaces, parentheses or hyphens, with an optional leading +',
  })
  mobileNumber?: string;

  @ApiPropertyOptional({ example: 'Sydney', maxLength: ADDRESS_MAX_LENGTH })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(ADDRESS_MAX_LENGTH)
  address?: string;
}

export class InvoiceItemDto {
  @ApiProperty({
    example: 'Consulting hours',
    minLength: 1,
    maxLength: ITEM_NAME_MAX_LENGTH,
  })
  @Transform(trim)
  @IsString()
  @Length(1, ITEM_NAME_MAX_LENGTH)
  name!: string;

  @ApiProperty({ example: 10, minimum: MIN_QUANTITY, maximum: MAX_QUANTITY })
  @IsInt()
  @Min(MIN_QUANTITY)
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiProperty({
    example: '150.00',
    description: `Decimal string, greater than 0, at most ${MAX_RATE_DECIMALS} decimals, at most ${MAX_RATE.toFixed()}.`,
  })
  @IsDecimalString({
    maxDecimals: MAX_RATE_DECIMALS,
    allowZero: false,
    max: MAX_RATE.toFixed(),
  })
  rate!: string;
}

export class CreateInvoiceDto {
  @ApiProperty({
    example: 'IV-2026-0001',
    minLength: 1,
    maxLength: INVOICE_NUMBER_MAX_LENGTH,
    pattern: INVOICE_NUMBER_PATTERN.source,
    description: 'Unique, case-insensitively.',
  })
  @Transform(trim)
  @IsString()
  @Length(1, INVOICE_NUMBER_MAX_LENGTH)
  @Matches(INVOICE_NUMBER_PATTERN, {
    message:
      'invoiceNumber must start with a letter or digit and contain only letters, digits and - _ / . #',
  })
  invoiceNumber!: string;

  @ApiPropertyOptional({
    example: 'PO-7781',
    maxLength: INVOICE_REFERENCE_MAX_LENGTH,
  })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(INVOICE_REFERENCE_MAX_LENGTH)
  invoiceReference?: string;

  @ApiProperty({ example: '2026-09-30', format: 'date' })
  @IsIsoDateString()
  invoiceDate!: string;

  @ApiProperty({
    example: '2026-10-30',
    format: 'date',
    description: 'Must be on or after invoiceDate.',
  })
  @IsIsoDateString()
  @IsOnOrAfter('invoiceDate')
  dueDate!: string;

  @ApiProperty({ enum: SUPPORTED_CURRENCIES, example: 'AUD' })
  @IsIn(SUPPORTED_CURRENCIES, {
    message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
  })
  currency!: string;

  @ApiPropertyOptional({
    example: 'Consulting',
    maxLength: DESCRIPTION_MAX_LENGTH,
  })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiProperty({ type: CustomerDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CustomerDto)
  customer!: CustomerDto;

  @ApiProperty({ type: [InvoiceItemDto], minItems: 1, maxItems: 1 })
  @IsArray()
  @ArrayMinSize(1, { message: 'items must contain exactly 1 item' })
  @ArrayMaxSize(1, { message: 'items must contain exactly 1 item' })
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];

  @ApiPropertyOptional({
    example: '10',
    default: '10',
    description: `Percent, 0 to ${MAX_TAX_RATE_PERCENT}, at most ${MAX_TAX_RATE_DECIMALS} decimals.`,
  })
  @IsOptional()
  @IsDecimalString({
    maxDecimals: MAX_TAX_RATE_DECIMALS,
    allowZero: true,
    max: String(MAX_TAX_RATE_PERCENT),
  })
  taxRate?: string;

  @ApiPropertyOptional({
    example: '0',
    default: '0',
    description:
      'Absolute amount in the invoice currency, not more decimals than the currency allows and not above the sub total.',
  })
  @IsOptional()
  @IsDecimalString({ maxDecimals: MAX_AMOUNT_DECIMALS, allowZero: true })
  discount?: string;
}
