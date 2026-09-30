import {
  type ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function setup(request: Record<string, unknown> = {}) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status, headersSent: false };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({
        id: 'req-id-1',
        method: 'GET',
        originalUrl: '/things?secret=1',
        ...request,
      }),
    }),
  } as unknown as ArgumentsHost;
  const logger = { error: jest.fn() };
  const filter = new AllExceptionsFilter(logger);
  return { filter, host, json, status, logger, response };
}

describe('AllExceptionsFilter', () => {
  it('passes HttpException through in the standard shape', () => {
    const { filter, host, status, json, logger } = setup();
    filter.catch(new NotFoundException('Invoice not found'), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Invoice not found',
      error: 'Not Found',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps message as string[] for validation errors', () => {
    const { filter, host, status, json } = setup();
    filter.catch(
      new BadRequestException(['a must be a string', 'b is required']),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: ['a must be a string', 'b is required'],
      error: 'Bad Request',
    });
  });

  it('derives the error name for a plain HttpException', () => {
    const { filter, host, json } = setup();
    filter.catch(new HttpException('Invoice number already exists', 409), host);
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      message: 'Invoice number already exists',
      error: 'Conflict',
    });
  });

  it('keeps custom message and error from an HttpException object body', () => {
    const { filter, host, json } = setup();
    filter.catch(
      new ConflictException({ message: 'dup', error: 'Conflict' }),
      host,
    );
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      message: 'dup',
      error: 'Conflict',
    });
  });

  it('returns a generic 500 and never leaks the error, stack or SQL', () => {
    const { filter, host, status, json, logger } = setup();
    const error = new Error(
      'duplicate key value violates unique constraint "x" (SELECT 1)',
    );
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
    const payload = JSON.stringify((json.mock.calls as unknown[][])[0][0]);
    expect(payload).not.toContain('SELECT');
    expect(payload).not.toContain('stack');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({
          name: 'Error',
          message: error.message,
          stack: error.stack,
        }) as unknown,
        requestId: 'req-id-1',
        path: '/things',
      }),
      expect.any(String),
    );
  });

  describe('database errors', () => {
    const EMAIL = 'jane.customer@example.test';
    const PHONE = '+84 901 234 567';

    function drizzleError(): Error {
      const driver = Object.assign(
        new Error(
          'duplicate key value violates unique constraint "invoices_number_key"',
        ),
        {
          severity: 'ERROR',
          code: '23505',
          constraint: 'invoices_number_key',
          table: 'invoices',
          detail: `Key (customer_email)=(${EMAIL}) already exists.`,
        },
      );
      const error = new Error(
        `Failed query: insert into "invoices" ("customer_email") values ($1)\nparams: ${EMAIL},${PHONE}`,
        { cause: driver },
      );
      error.name = 'DrizzleQueryError';
      return Object.assign(error, {
        query: 'insert into "invoices" ("customer_email") values ($1)',
        params: [EMAIL, PHONE],
      });
    }

    function loggedError(error: unknown): Record<string, unknown> {
      const { filter, host, logger } = setup();
      filter.catch(error, host);
      const [payload] = logger.error.mock.calls[0] as [{ err: unknown }];
      return payload.err as Record<string, unknown>;
    }

    it('logs only SQLSTATE, constraint, table and the driver message', () => {
      expect(loggedError(drizzleError())).toMatchObject({
        name: 'DrizzleQueryError',
        code: '23505',
        constraint: 'invoices_number_key',
        table: 'invoices',
        message:
          'duplicate key value violates unique constraint "invoices_number_key"',
      });
    });

    it('never logs bound values, SQL text or the driver detail', () => {
      const { filter, host, logger } = setup();
      filter.catch(drizzleError(), host);
      const logged = JSON.stringify(logger.error.mock.calls);
      expect(logged).not.toContain(EMAIL);
      expect(logged).not.toContain(PHONE);
      expect(logged).not.toContain('Failed query');
      expect(logged).not.toContain('params');
      expect(logged).not.toContain('insert into');
    });

    it('sanitizes a bare driver error the same way', () => {
      const bare = Object.assign(new Error('deadlock detected\nDETAIL: x'), {
        severity: 'ERROR',
        code: '40P01',
        detail: `Process 1 waits for row of ${EMAIL}`,
      });
      const logged = loggedError(bare);
      expect(logged).toMatchObject({
        code: '40P01',
        message: 'deadlock detected',
      });
      expect(JSON.stringify(logged)).not.toContain(EMAIL);
    });

    it('does not treat Node system errors as database errors', () => {
      const error = Object.assign(new Error('read ECONNRESET'), {
        code: 'ECONNRESET',
      });
      expect(loggedError(error)).toMatchObject({
        name: 'Error',
        message: 'read ECONNRESET',
        stack: error.stack,
      });
    });
  });

  it('handles non-Error throwables as 500', () => {
    const { filter, host, status } = setup();
    filter.catch('boom', host);
    expect(status).toHaveBeenCalledWith(500);
  });

  it('maps exposed client errors from Express middleware (payload too large)', () => {
    const { filter, host, status, json, logger } = setup();
    filter.catch(
      Object.assign(new Error('request entity too large'), {
        status: 413,
        expose: true,
      }),
      host,
    );
    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      statusCode: 413,
      message: 'request entity too large',
      error: 'Payload Too Large',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not write when headers were already sent', () => {
    const { filter, host, status, response } = setup();
    response.headersSent = true;
    filter.catch(new Error('late'), host);
    expect(status).not.toHaveBeenCalled();
  });
});
