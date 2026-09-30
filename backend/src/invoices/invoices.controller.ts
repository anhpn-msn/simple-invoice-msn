import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { requestContext } from '../audit';
import type { AuthPrincipal } from '../common/auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  HTTP_HEADERS,
  IDEMPOTENT_REPLAYED_TRUE,
} from '../common/http/http-headers.constants';
import { createApiErrors } from '../common/swagger/api-errors.decorator';
import { IdempotencyKey } from '../idempotency';
import { IDEMPOTENCY_KEY_MAX_LENGTH } from '../database/database.constants';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import {
  InvoiceDetailDto,
  InvoiceListResponseDto,
} from './dto/invoice-response.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { InvoicesService } from './invoices.service';

const ApiErrors = createApiErrors({
  [HttpStatus.UNAUTHORIZED]: 'Missing, invalid or expired access token',
  [HttpStatus.FORBIDDEN]: 'The caller lacks the required permission',
  [HttpStatus.UNPROCESSABLE_ENTITY]:
    'Idempotency-Key reused with a different payload',
});

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermissions('invoice:read')
  @ApiOperation({
    summary: 'List invoices with search, filters, sorting and paging',
  })
  @ApiOkResponse({ type: InvoiceListResponseDto })
  @ApiErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  list(@Query() query: ListInvoicesQueryDto): Promise<InvoiceListResponseDto> {
    return this.invoices.list(query);
  }

  @Get(':id')
  @RequirePermissions('invoice:read')
  @ApiOperation({ summary: 'Get one invoice with its customer and line items' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: InvoiceDetailDto })
  @ApiErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<InvoiceDetailDto> {
    return this.invoices.get(id);
  }

  @Post()
  @RequirePermissions('invoice:create')
  @ApiOperation({
    summary: 'Create a Draft invoice',
    description:
      'Totals are calculated by the server. Send an Idempotency-Key to make retries safe: the same key with the same body replays the first response (header Idempotent-Replayed: true).',
  })
  @ApiHeader({
    name: HTTP_HEADERS.IDEMPOTENCY_KEY,
    required: false,
    description: `1 to ${IDEMPOTENCY_KEY_MAX_LENGTH} visible ASCII characters, unique per user for 24 hours.`,
    example: '0d7c5a3e-6a54-4f19-8c53-6a0c3c8f2b11',
  })
  @ApiBody({ type: CreateInvoiceDto })
  @ApiCreatedResponse({
    type: InvoiceDetailDto,
    description: 'Created. The Location header points to the new invoice.',
    headers: {
      [HTTP_HEADERS.LOCATION]: {
        description: '/invoices/{id}',
        schema: { type: 'string' },
      },
      [HTTP_HEADERS.IDEMPOTENT_REPLAYED]: {
        description:
          'Present with value true when this is a replay of an earlier request.',
        schema: { type: 'string' },
      },
    },
  })
  @ApiErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.CONFLICT,
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  async create(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() principal: AuthPrincipal,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<InvoiceDetailDto> {
    const result = await this.invoices.create(dto, principal, {
      idempotencyKey,
      context: requestContext(request),
    });
    response.status(result.status);
    response.location(`/invoices/${result.body.invoiceId}`);
    if (result.replayed)
      response.setHeader(
        HTTP_HEADERS.IDEMPOTENT_REPLAYED,
        IDEMPOTENT_REPLAYED_TRUE,
      );
    return result.body;
  }
}
