import 'reflect-metadata';
import type { Request, Response } from 'express';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import type { AuthPrincipal } from '../common/auth/auth.types';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesController } from './invoices.controller';
import type { InvoicesService } from './invoices.service';
import {
  HTTP_HEADERS,
  IDEMPOTENT_REPLAYED_TRUE,
  headerKey,
} from '../common/http/http-headers.constants';

const proto = InvoicesController.prototype;
const metadata = (key: string, method: keyof InvoicesController): unknown =>
  Reflect.getMetadata(
    key,
    (Object.getOwnPropertyDescriptor(proto, method) as PropertyDescriptor)
      .value as object,
  );

describe('InvoicesController access control', () => {
  it.each([
    ['list', ['invoice:read']],
    ['get', ['invoice:read']],
    ['create', ['invoice:create']],
  ] as const)('%s requires %j', (method, permissions) => {
    expect(metadata(PERMISSIONS_KEY, method)).toEqual(permissions);
  });

  it('exposes no public route', () => {
    for (const method of ['list', 'get', 'create'] as const) {
      expect(metadata(IS_PUBLIC_KEY, method)).toBeUndefined();
    }
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, InvoicesController),
    ).toBeUndefined();
  });
});

describe('InvoicesController.create', () => {
  const principal = { userId: 'u1' } as AuthPrincipal;
  const request = {
    headers: { [headerKey(HTTP_HEADERS.USER_AGENT)]: 'jest' },
    ip: '127.0.0.1',
  } as unknown as Request;
  const body = { invoiceId: 'inv-1' };

  function setup(result: { status: number; body: unknown; replayed: boolean }) {
    const service = { create: jest.fn().mockResolvedValue(result) };
    const response = {
      status: jest.fn(),
      location: jest.fn(),
      setHeader: jest.fn(),
    };
    const controller = new InvoicesController(
      service as unknown as InvoicesService,
    );
    return { service, response, controller };
  }

  it('sets 201 and Location for a new invoice, with no replay header', async () => {
    const { controller, response, service } = setup({
      status: 201,
      body,
      replayed: false,
    });

    const returned = await controller.create(
      {} as CreateInvoiceDto,
      principal,
      'k1',
      request,
      response as unknown as Response,
    );

    expect(returned).toBe(body);
    expect(service.create).toHaveBeenCalledWith(
      {},
      principal,
      expect.objectContaining({ idempotencyKey: 'k1' }),
    );
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.location).toHaveBeenCalledWith('/invoices/inv-1');
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('marks a replay with Idempotent-Replayed: true', async () => {
    const { controller, response } = setup({
      status: 201,
      body,
      replayed: true,
    });

    await controller.create(
      {} as CreateInvoiceDto,
      principal,
      'k1',
      request,
      response as unknown as Response,
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      HTTP_HEADERS.IDEMPOTENT_REPLAYED,
      IDEMPOTENT_REPLAYED_TRUE,
    );
  });
});
