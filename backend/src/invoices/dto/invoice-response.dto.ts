import { ApiProperty } from '@nestjs/swagger';
import { INVOICE_STATUSES } from '../domain';
import type { InvoiceStatus } from '../domain';
import { PagingDto } from '../../common/dto/paging.dto';

export class InvoiceListItemDto {
  @ApiProperty({ format: 'uuid' })
  invoiceId!: string;

  @ApiProperty({ example: 'IV-2026-0001' })
  invoiceNumber!: string;

  @ApiProperty({ example: 'Jane Doe' })
  customerName!: string;

  @ApiProperty({ format: 'date', example: '2026-09-30' })
  invoiceDate!: string;

  @ApiProperty({ format: 'date', example: '2026-10-30' })
  dueDate!: string;

  @ApiProperty({ example: 'AUD' })
  currency!: string;

  @ApiProperty({ example: 'AU$' })
  currencySymbol!: string;

  @ApiProperty({
    example: '2180.00',
    description: 'Decimal string in the currency minor units.',
  })
  totalAmount!: string;

  @ApiProperty({
    example: '728.66',
    description: 'Decimal string in the currency minor units.',
  })
  balanceAmount!: string;

  @ApiProperty({
    enum: INVOICE_STATUSES,
    description:
      'Effective status; Overdue is derived at read time, never stored.',
  })
  status!: InvoiceStatus;
}

export class InvoiceListResponseDto {
  @ApiProperty({ type: [InvoiceListItemDto] })
  data!: InvoiceListItemDto[];

  @ApiProperty({ type: PagingDto })
  paging!: PagingDto;
}

export class InvoiceCustomerResponseDto {
  @ApiProperty({ example: 'Jane Doe' })
  fullname!: string;

  @ApiProperty({ example: 'jane@example.com' })
  email!: string;

  @ApiProperty({ nullable: true, type: String, example: '+61 400 000 000' })
  mobileNumber!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'Sydney' })
  address!: string | null;
}

export class InvoiceItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Consulting hours' })
  name!: string;

  @ApiProperty({ example: 10 })
  quantity!: number;

  @ApiProperty({
    example: '150.00',
    description:
      'At least the currency minor units, up to 4 decimals when the stored rate has them.',
  })
  rate!: string;
}

export class InvoiceDetailDto {
  @ApiProperty({ format: 'uuid' })
  invoiceId!: string;

  @ApiProperty({ example: 'IV-2026-0001' })
  invoiceNumber!: string;

  @ApiProperty({ nullable: true, type: String, example: 'PO-7781' })
  invoiceReference!: string | null;

  @ApiProperty({ format: 'date', example: '2026-09-30' })
  invoiceDate!: string;

  @ApiProperty({ format: 'date', example: '2026-10-30' })
  dueDate!: string;

  @ApiProperty({ example: 'AUD' })
  currency!: string;

  @ApiProperty({ example: 'AU$' })
  currencySymbol!: string;

  @ApiProperty({ nullable: true, type: String, example: 'Consulting' })
  description!: string | null;

  @ApiProperty({ enum: INVOICE_STATUSES })
  status!: InvoiceStatus;

  @ApiProperty({ type: InvoiceCustomerResponseDto })
  customer!: InvoiceCustomerResponseDto;

  @ApiProperty({ type: [InvoiceItemResponseDto] })
  items!: InvoiceItemResponseDto[];

  @ApiProperty({ example: '10.00', description: 'Percent with 2 decimals.' })
  taxRate!: string;

  @ApiProperty({ example: '2000.00' })
  invoiceSubTotal!: string;

  @ApiProperty({ example: '200.00' })
  totalTax!: string;

  @ApiProperty({ example: '20.00' })
  totalDiscount!: string;

  @ApiProperty({ example: '2180.00' })
  totalAmount!: string;

  @ApiProperty({ example: '1451.34' })
  totalPaid!: string;

  @ApiProperty({ example: '728.66' })
  balanceAmount!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-06-03T12:03:26.995Z',
  })
  createdAt!: string;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;
}
