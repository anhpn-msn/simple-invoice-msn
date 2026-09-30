import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { AUDIT_ENTITY_TYPES, AuditService } from '../audit';
import type { AuthPrincipal } from '../common/auth/auth.types';
import { BusinessCalendar } from '../common/clock';
import { uuidv7 } from '../common/ids/uuidv7';
import {
  PG_LOCK_NOT_AVAILABLE,
  PG_UNIQUE_VIOLATION,
} from '../database/database.constants';
import { DRIZZLE } from '../database/database.module';
import type { Database, Transaction } from '../database/database.types';
import { IdempotencyService, pgErrorInfo } from '../idempotency';
import {
  DEFAULT_TAX_RATE,
  DomainValidationError,
  calculateInvoiceTotals,
  getCurrency,
} from './domain';
import type { InvoiceTotals } from './domain';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';
import type {
  InvoiceDetailDto,
  InvoiceListResponseDto,
} from './dto/invoice-response.dto';
import type { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import {
  CONFLICTING_REQUEST_IN_PROGRESS,
  CREATE_INVOICE_METHOD,
  CREATE_INVOICE_PATH,
  DUPLICATE_INVOICE_NUMBER,
  IDEMPOTENCY_IN_PROGRESS,
  INSERT_LOCK_TIMEOUT,
  INVOICE_NUMBER_UNIQUE_INDEX,
  SINGLE_ITEM_POSITION,
} from './invoices.constants';
import { toDetail, toListItem } from './invoices.mapper';
import { InvoicesRepository } from './invoices.repository';
import type {
  CreateInvoiceOptions,
  CreateInvoiceResult,
  InvoiceScope,
} from './invoices.types';

/** Everyone with invoice:read sees every invoice today (SPEC A-12). */
const ALL_INVOICES: InvoiceScope = {};

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: InvoicesRepository,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly calendar: BusinessCalendar,
  ) {}

  async list(query: ListInvoicesQueryDto): Promise<InvoiceListResponseDto> {
    const today = this.calendar.today();
    const { rows, total } = await this.repository.list(
      {
        keyword: query.keyword,
        status: query.status,
        fromDate: query.fromDate,
        toDate: query.toDate,
        sortBy: query.sortBy,
        ordering: query.ordering,
        page: query.page,
        pageSize: query.pageSize,
        today,
      },
      ALL_INVOICES,
    );
    return {
      data: rows.map((row) => toListItem(row, today)),
      paging: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async get(id: string): Promise<InvoiceDetailDto> {
    const found = await this.repository.findById(id, ALL_INVOICES);
    if (!found) throw new NotFoundException('Invoice not found');
    return toDetail(found.invoice, found.items, this.calendar.today());
  }

  /**
   * Creates a Draft invoice. Business rules are checked before any transaction
   * opens, so a rejected request never touches the idempotency table and the
   * client may retry with the same key after fixing it. Everything else
   * (idempotency claim, invoice, item, audit event, stored response) is one
   * transaction: it all commits or none of it does.
   */
  async create(
    dto: CreateInvoiceDto,
    principal: AuthPrincipal,
    options: CreateInvoiceOptions = {},
  ): Promise<CreateInvoiceResult> {
    const totals = this.calculate(dto);
    const today = this.calendar.today();
    const { idempotencyKey } = options;
    const requestHash = idempotencyKey
      ? this.idempotency.fingerprint(
          CREATE_INVOICE_METHOD,
          CREATE_INVOICE_PATH,
          dto,
        )
      : undefined;

    try {
      return await this.db.transaction(async (tx) => {
        // Bounds the wait on a concurrent duplicate; see mapPersistenceError.
        await tx.execute(
          sql`SELECT set_config('lock_timeout', ${INSERT_LOCK_TIMEOUT}, true)`,
        );

        if (idempotencyKey && requestHash) {
          const claim = await this.idempotency.begin(tx, {
            userId: principal.userId,
            key: idempotencyKey,
            method: CREATE_INVOICE_METHOD,
            path: CREATE_INVOICE_PATH,
            requestHash,
          });
          if (claim.kind === 'replay') {
            return {
              status: claim.response.status,
              body: claim.response.body as InvoiceDetailDto,
              replayed: true,
            };
          }
        }

        const body = await this.insertInvoice(
          tx,
          dto,
          totals,
          principal,
          today,
          options,
        );
        const result: CreateInvoiceResult = {
          status: HttpStatus.CREATED,
          body,
          replayed: false,
        };
        if (idempotencyKey) {
          await this.idempotency.complete(
            tx,
            { userId: principal.userId, key: idempotencyKey },
            result,
          );
        }
        return result;
      });
    } catch (error) {
      throw this.mapPersistenceError(error, idempotencyKey !== undefined);
    }
  }

  private calculate(dto: CreateInvoiceDto): InvoiceTotals {
    const item = dto.items[0];
    try {
      return calculateInvoiceTotals({
        quantity: item.quantity,
        rate: item.rate,
        taxRate: dto.taxRate,
        discount: dto.discount,
        currency: dto.currency,
      });
    } catch (error) {
      if (error instanceof DomainValidationError) {
        throw new BadRequestException(error.messages);
      }
      throw error;
    }
  }

  private async insertInvoice(
    tx: Transaction,
    dto: CreateInvoiceDto,
    totals: InvoiceTotals,
    principal: AuthPrincipal,
    today: string,
    options: CreateInvoiceOptions,
  ): Promise<InvoiceDetailDto> {
    const item = dto.items[0];
    const invoiceId = uuidv7();
    const created = await this.repository.insertWithItem(
      tx,
      {
        id: invoiceId,
        invoiceNumber: dto.invoiceNumber,
        invoiceReference: dto.invoiceReference ?? null,
        invoiceDate: dto.invoiceDate,
        dueDate: dto.dueDate,
        currency: dto.currency,
        currencySymbol: getCurrency(dto.currency).symbol,
        description: dto.description ?? null,
        status: 'Draft',
        customerFullname: dto.customer.fullname,
        customerEmail: dto.customer.email,
        customerMobile: dto.customer.mobileNumber ?? null,
        customerAddress: dto.customer.address ?? null,
        taxRate: dto.taxRate ?? DEFAULT_TAX_RATE,
        invoiceSubTotal: totals.subTotal.toFixed(),
        totalTax: totals.taxAmount.toFixed(),
        totalDiscount: totals.discount.toFixed(),
        totalAmount: totals.totalAmount.toFixed(),
        totalPaid: totals.totalPaid.toFixed(),
        balanceAmount: totals.balanceAmount.toFixed(),
        createdBy: principal.userId,
      },
      {
        id: uuidv7(),
        invoiceId,
        name: item.name,
        quantity: item.quantity,
        rate: item.rate,
        position: SINGLE_ITEM_POSITION,
      },
    );
    const body = toDetail(created.invoice, created.items, today);

    await this.audit.record(
      {
        action: 'INVOICE_CREATED',
        outcome: 'SUCCESS',
        actorUserId: principal.userId,
        entityType: AUDIT_ENTITY_TYPES.INVOICE,
        entityId: invoiceId,
        metadata: {
          invoiceNumber: body.invoiceNumber,
          totalAmount: body.totalAmount,
          currency: body.currency,
        },
        context: options.context,
      },
      tx,
    );
    return body;
  }

  /**
   * Turns database failures into the documented HTTP errors. The SQLSTATE sits
   * on `error.cause`, and 23505 is only the duplicate-number case when it comes
   * from that exact index. 55P03 (lock_timeout) is a concurrent duplicate:
   * with a key it is the same request still in flight; without a key it can
   * only be another insert of the same invoice number that has not committed.
   */
  private mapPersistenceError(
    error: unknown,
    hasIdempotencyKey: boolean,
  ): unknown {
    if (error instanceof HttpException) return error;
    const { code, constraint } = pgErrorInfo(error);
    if (
      code === PG_UNIQUE_VIOLATION &&
      constraint === INVOICE_NUMBER_UNIQUE_INDEX
    ) {
      return new ConflictException(DUPLICATE_INVOICE_NUMBER);
    }
    if (code === PG_LOCK_NOT_AVAILABLE) {
      return new ConflictException(
        hasIdempotencyKey
          ? IDEMPOTENCY_IN_PROGRESS
          : CONFLICTING_REQUEST_IN_PROGRESS,
      );
    }
    return error;
  }
}
