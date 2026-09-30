# SimpleInvoice: Technical Specification

Version 1.0 (2026-09-30). Source requirements: `docs/Assessment_Fullstack_v3.0.0.pdf` (text copy in `docs/assessment.txt`).

This document is the single source of truth for the implementation. Where the assessment is ambiguous, the interpretation chosen here is recorded in section 2 and must be followed. If the code and this document disagree, the code is wrong.

Contents

1. Scope and requirement traceability
2. Assumptions and interpretations
3. Architecture
4. Domain model and business rules
5. Database design
6. API contract
7. Security design
8. Frontend design
9. Observability and audit
10. Configuration
11. Packaging and runtime (Docker)
12. Testing strategy
13. Value-add scope tiers
14. Known limitations

---

## 1. Scope and requirement traceability

| ID | Requirement (assessment section) | Where it is satisfied | Verified by |
|---|---|---|---|
| R-AUTH-1 | Login screen with email + password (2.1.1) | FE `pages/login`, `features/auth-login` | FE test `login-form.test.tsx` |
| R-AUTH-2 | Client and server validation of auth inputs (2.1.1) | zod schema (FE), `LoginDto` class-validator (BE) | FE + BE unit tests |
| R-AUTH-3 | Issue JWT, store securely on client (2.1.1, 2.3.3) | 7.2, 7.3 | BE e2e `auth.e2e-spec.ts` |
| R-AUTH-4 | Protected routes redirect to login (2.1.1) | FE `app/router` guard | FE test `protected-route.test.tsx` |
| R-AUTH-5 | All `/invoices` endpoints behind JWT guard (2.3.3) | Global `JwtAuthGuard`, deny by default | BE e2e (401 without token) |
| R-AUTH-6 | Token TTL from env, default 3600 s (2.3.3) | `JWT_ACCESS_TTL_SECONDS` | BE config unit test |
| R-AUTH-7 | Seeded default user, documented in README (2.3.3) | Seed script, README | Manual + e2e login |
| R-LIST-1 | Paginated list with the six key fields (2.1.2) | `GET /invoices`, FE `pages/invoice-list` | BE e2e, FE test |
| R-LIST-2 | Search: invoice number or customer name, case-insensitive, partial (2.1.2) | `keyword` param, ILIKE + pg_trgm | BE e2e |
| R-LIST-3 | Filter by status incl. derived Overdue (2.1.2) | 4.4 filter semantics | BE unit + e2e |
| R-LIST-4 | Sort by invoiceDate, dueDate, totalAmount asc/desc (2.1.2) | `sortBy` + `ordering` whitelist | BE e2e |
| R-LIST-5 | Server-side pagination, configurable page size (2.1.2) | `page`, `pageSize` (max 100) | BE e2e |
| R-LIST-6 | fromDate / toDate filters (2.3.1) | on `invoiceDate` | BE e2e |
| R-DET-1 | Detail view with all listed fields (2.1.3) | `GET /invoices/:id`, FE `pages/invoice-detail` | BE e2e, FE test |
| R-CRE-1 | Create form, one line item, status Draft (2.1.4) | `POST /invoices`, FE `pages/invoice-create` | BE e2e, FE test |
| R-CRE-2 | Field validation table (2.1.4) | `CreateInvoiceDto` + zod schema | BE + FE unit tests |
| R-CRE-3 | Unique invoice number enforced by DB (2.3.2) | unique index on `lower(invoice_number)` | BE unit + e2e (409) |
| R-CRE-4 | Totals calculated by backend only (2.1.4, 2.3.2) | `InvoiceCalculator` | BE unit |
| R-CRE-5 | Success toast then redirect to list (2.1.4) | FE `features/invoice-create` | FE test |
| R-BIZ-1 | Overdue derived at read time, never stored (2.3.2) | 4.4, DB CHECK on status | BE unit + DB constraint |
| R-VAL-1 | class-validator ValidationPipe, structured 400 (2.3.5) | global `ValidationPipe` | BE e2e |
| R-ERR-1 | Global exception filter, consistent shape (2.3.6) | `AllExceptionsFilter` | BE unit |
| R-DOC-1 | Swagger at `/api/docs`, all endpoints documented (2.3.8) | `@nestjs/swagger` | Manual |
| R-SEED-1 | `npm run seed`, Appendix A + 20 to 50 generated (2.3.4) | `backend/src/database/seed` | Manual + e2e fixture |
| R-FE-1 | Responsive, React + TS, unit tests (2.2) | Tailwind responsive layouts | FE tests |
| R-OPS-1 | docker compose up, Dockerfile per service, ports documented (2.4.2) | `docker-compose.yml` | Manual |
| R-OPS-2 | `.env` based config, `.env.example`, no hardcoded secrets (2.4.3) | section 10 | Startup validation |
| R-DOCS-1 | README contents (4.2) | `README.md` | Checklist |

## 2. Assumptions and interpretations

Every item here is a deliberate decision. Each one is repeated in the README "Assumptions" section.

| ID | Topic | Decision | Rationale |
|---|---|---|---|
| A-1 | Discount | `discount` is an absolute amount in the invoice currency, not a percentage. It must satisfy `0 <= discount <= subTotal`. | The formula `totalAmount = subTotal + taxAmount - discount` subtracts it as an amount (Appendix A: 2000 + 200 - 20 = 2180). Capping at `subTotal` (rather than the looser `subTotal + tax`) means a discount can never cancel tax that is owed, and keeps `totalAmount >= taxAmount >= 0`. |
| A-2 | Tax base | Tax is computed on the full `subTotal` (before discount), exactly as the assessment formula states. | Follow the specification literally; noted in README that many tax regimes apply tax after a pre-tax discount. |
| A-3 | Money precision | All money is exact decimal (`NUMERIC` in DB, `decimal.js` in code). Computed amounts are rounded to the currency's ISO 4217 minor units with ROUND_HALF_UP, once, at each step of the formula (subTotal, taxAmount). | Binary floating point cannot represent money. Half-up matches common tax authority guidance (see `docs/research/03-money-and-banking.md`). |
| A-4 | Money on the wire | Monetary amounts and rates are JSON **strings** with fixed scale (e.g. `"2180.00"`, JPY `"2180"`). Request money fields accept strings matching `^\d{1,15}(\.\d{1,4})?$`. `quantity` stays a JSON integer. | Avoids IEEE-754 precision loss in any client; same approach as ISO 20022 / Google Money style decimal strings. Documented as a deliberate deviation from the numeric style of Appendix A. |
| A-5 | Currency | Allowlist registry in code: AUD, USD, GBP, EUR, SGD, JPY, VND (extensible). `currencySymbol` is derived by the server from the registry, never accepted from the client. | Prevents inconsistent symbol/code pairs; minor units drive rounding. |
| A-6 | Business date ("today") | "today" is the calendar date in `BUSINESS_TIMEZONE` (default `UTC`), taken from an injectable `Clock`. A due date equal to today is **not** overdue. | The assessment does not define a timezone. Core-banking systems work on a business date; an injectable clock makes the rule deterministic and testable. |
| A-7 | Overdue applies to Draft | Per the literal rule (`status != Paid AND dueDate < today`), a Draft past its due date is reported as Overdue. | Follow the specification literally; documented. |
| A-8 | Status filter semantics | Filtering uses the **effective** (displayed) status: `Overdue` = persisted in (Draft, Pending) and dueDate < today; `Draft`/`Pending` = persisted status and dueDate >= today; `Paid` = persisted Paid. | Otherwise a "Pending" filter would return rows displayed as "Overdue", which contradicts what the user sees. |
| A-9 | Date filters | `fromDate` / `toDate` filter on `invoiceDate`, inclusive. `fromDate > toDate` is a 400. | Most natural reading; invoice date is the document date. |
| A-10 | Invoice number | Trimmed, 1 to 50 chars, pattern `^[A-Za-z0-9][A-Za-z0-9\-_/.#]*$`. Uniqueness is case-insensitive (`IV-001` equals `iv-001`), enforced by a unique index on `lower(invoice_number)`. The original casing is stored. | Prevents look-alike duplicates, a known source of payment misallocation. |
| A-11 | Customer storage | Customer fields are embedded on the invoice row (snapshot). | An invoice is a legal document: customer details must be frozen at issue time even if a customer master record later changes. |
| A-12 | Visibility | Single-tenant: every authenticated user with `invoice:read` sees all invoices in the system ("all available invoices", 2.1). | Multi-tenant ownership scoping is listed as a limitation; the repository takes a scope object so it can be added without touching controllers. |
| A-13 | Authorization model | Role-based permissions. Roles: `ACCOUNTANT` (`invoice:read`, `invoice:create`, plus tier-2 permissions) and `AUDITOR` (`invoice:read` only). | Demonstrates authorization (403) beyond authentication (401) at no cost to the spec. |
| A-14 | Seed data | The Appendix A record is seeded with persisted status `Pending` (its `Overdue` is derived again at read time). Its `createdBy` UUID is used as the demo user's id. Generated records are deterministic (fixed PRNG seed) with dates relative to the seed run date so that Overdue always exists. Totals of generated records are computed by the same `InvoiceCalculator` used by the API. | The spec forbids storing Overdue; relative dates keep the demo meaningful whenever it is run. |
| A-15 | Response paging shape | Use the shape from 2.3.1 (`paging.page`, `paging.pageSize`, `paging.total`), not Appendix A's `pageNumber/totalRecords`. | Section 2.3.1 is the normative API contract. |
| A-16 | Page beyond the end | Returns `200` with `data: []` and the real `total`. | Standard, lets the client recover. |
| A-17 | Route prefix | Backend routes are exactly as in 2.3.1 (`/auth/login`, `/invoices`, ...). The SPA reaches them through the same-origin reverse proxy path `/api/*` (nginx in Docker, Vite proxy in dev), which strips `/api`. Swagger is at `/api/docs` on the backend and is also proxied. | Keeps the contract exact while making browser traffic same-origin (no CORS, first-party cookies). |
| A-18 | Password policy | No complexity policy (per 2.1.1 note). Password length 1 to 72 bytes at login; the 72-byte cap is bcrypt's input limit. | Avoids silent truncation by bcrypt. |

## 3. Architecture

### 3.1 Overview

```
 Browser (React SPA)
   |  https://host:8080   (same origin for UI and API)
   v
 nginx (frontend container)
   |-- /            static SPA assets, security headers, CSP
   |-- /api/*  -->  reverse proxy, strips /api
   v
 NestJS API (backend container, port 3000)
   |-- global middleware: helmet, request-id, pino logger, body size limit
   |-- global guards:     ThrottlerGuard -> JwtAuthGuard (deny by default) -> PermissionsGuard
   |-- global pipe:       ValidationPipe (whitelist, forbidNonWhitelisted, transform)
   |-- global filter:     AllExceptionsFilter (uniform error shape, no leaks)
   |-- modules: auth, users, invoices, idempotency, audit, health, database, config
   v
 PostgreSQL 17 (db container, volume)
```

Two repositories (the assessment allows "a monorepo or two separate repos"). Clone them side by side:

```
<workspace>/
  simple-invoice-api/     NestJS API + PostgreSQL migrations/seed + full-stack docker-compose.yml
    docs/                 SPEC.md (this file), ARCHITECTURE.md, research/
    docker-compose.yml    starts db + backend + frontend (frontend built from ../simple-invoice-web)
    .env.example
    README.md
  simple-invoice-web/     React SPA (Feature-Sliced Design), own Dockerfile + nginx config
    README.md
```

The full-stack `docker-compose.yml` lives in the API repo because it owns the database. The frontend build context is `${WEB_CONTEXT:-../simple-invoice-web}` (overridable, e.g. with a git URL). Wherever this document says `backend/` or `frontend/`, read `simple-invoice-api/` or `simple-invoice-web/`.

### 3.2 Backend module layout

```
backend/src/
  main.ts                      bootstrap: helmet, trust proxy, swagger, pipes, filter
  app.module.ts
  config/                      env schema + typed config service (fail fast on invalid env)
  common/
    clock/                     Clock interface, SystemClock, businessDate(tz)
    decorators/                @Public(), @RequirePermissions(), @AuthenticatedOnly(), @CurrentUser()
    filters/                   AllExceptionsFilter
    guards/                    JwtAuthGuard, PermissionsGuard
    middleware/                RequestIdMiddleware
    dto/                       ErrorResponseDto, PagingDto
  database/                    DB client module, schema, migrations, seed/
  auth/                        controller, service, token service, refresh-token repo, password hasher, dto
  users/                       users repository
  invoices/
    domain/                    money.ts, currency-registry.ts, invoice-calculator.ts, invoice-status.ts (pure, no Nest)
    dto/                       CreateInvoiceDto, ListInvoicesQueryDto, InvoiceResponseDto, ...
    invoices.controller.ts
    invoices.service.ts
    invoices.repository.ts
  idempotency/                 IdempotencyService (transaction-scoped)
  audit/                       AuditService (append-only writer)
  health/                      GET /health
```

Rule: `invoices/domain` is framework-free TypeScript. All money math and status derivation live there and are unit tested in isolation.

### 3.3 Frontend layout

See section 8.

### 3.4 Technology decisions (pinned; see `docs/research/01-stack-versions.md`)

Pin exact versions. Do not float `latest` (TypeScript 7, msw 3, react-router 8 and Prisma 8 rc are all `latest` today and break this stack).

| Area | Choice | Version | Why |
|---|---|---|---|
| Runtime | Node.js | 24 LTS (`node:24-alpine`, local `.nvmrc` = 24) | Active LTS; frontend tooling needs >= 22.22 |
| Database | PostgreSQL | 17 (`postgres:17-alpine`) | Assessment recommends Postgres; 17 avoids the PG 18 PGDATA volume-path change |
| API framework | NestJS | 11.x (CommonJS, Jest) | Required by the assessment; v11 is patched and avoids the ESM-only v12 migration risk |
| ORM | Drizzle ORM + drizzle-kit | 0.45.3 / 0.31.11, driver `pg` 8.x | CHECK constraints, expression and GIN/pg_trgm indexes declared in schema and emitted to committed SQL migrations; NUMERIC returned as strings (exact); native `FOR UPDATE`; no codegen; CJS-friendly. Prisma was rejected because CHECK/expression indexes need hand-edited SQL and Prisma 7/8 has CJS/ESM churn |
| Money | decimal.js | 10.6.0 | exact decimal arithmetic, explicit rounding modes |
| Passwords | bcryptjs | 3.0.3 (ships types) | assessment mandates bcrypt; pure JS avoids native builds in Alpine |
| Validation | class-validator / class-transformer | 0.15.1 / 0.5.1 | mandated by the assessment |
| Logging | nestjs-pino (+ pino 10, pino-http 11) | 5.2.1 | structured logs, redaction |
| Security | helmet 8, @nestjs/throttler 6, cookie-parser | | |
| API tests | Jest 30, ts-jest 29, supertest 7, @testcontainers/postgresql 12 | | real Postgres in e2e tests |
| TypeScript | 5.9.3 (both repos) | | TS 7 breaks swagger and ts-jest |
| SPA | React 19.3, Vite 8.3, @vitejs/plugin-react 6 | | |
| Routing | react-router 7.18.x (import from `react-router`, `react-router/dom`) | | v8 drops APIs |
| Server state | @tanstack/react-query 5 | | caching, dedup, retries |
| Forms | react-hook-form 7 + zod 4 + @hookform/resolvers 5 | | |
| UI | Tailwind CSS 4.3 (`@tailwindcss/vite`) + shadcn/ui (Radix) | | responsive, accessible primitives |
| SPA tests | Vitest 5, @testing-library/react 16 (+ `@testing-library/dom`), user-event 14, jest-dom, jsdom, msw 2.15 | | |
| FSD lint | steiger + @feature-sliced/steiger-plugin | 0.7.0 / 0.8.0 | official FSD linter |

## 4. Domain model and business rules

### 4.1 Money

- Type: `Decimal` (decimal.js) everywhere in the backend; never `number` for money.
- `roundMoney(value, currency)`: `value.toDecimalPlaces(minorUnits(currency), Decimal.ROUND_HALF_UP)`.
- `formatMoney(value, currency)`: `value.toFixed(minorUnits(currency))` for the API string.
- Storage: `NUMERIC(19,4)` for all amounts and rates (covers every ISO 4217 minor unit up to 4). Stored amounts are already rounded to the currency minor units.

### 4.2 Currency registry

| Code | Symbol | Minor units |
|---|---|---|
| AUD | AU$ | 2 |
| USD | US$ | 2 |
| GBP | £ | 2 |
| EUR | € | 2 |
| SGD | S$ | 2 |
| JPY | ¥ | 0 |
| VND | ₫ | 0 |

A money input with more decimals than the currency allows for amounts (`discount`) is rejected with 400. `rate` may carry up to 4 decimals (unit prices can be finer than the currency unit); the computed `subTotal` is rounded.

### 4.3 Invoice calculation (`InvoiceCalculator.calculate`)

Input: `quantity` (int), `rate` (Decimal), `taxRate` (percent, Decimal), `discount` (Decimal), `currency`, `totalPaid` (Decimal, 0 on create).

```
subTotal      = round(quantity * rate)
taxAmount     = round(subTotal * taxRate / 100)
discount      = discount (must already have <= minor units, and 0 <= discount <= subTotal)
totalAmount   = subTotal + taxAmount - discount
balanceAmount = totalAmount - totalPaid
```

Limits (reject with 400): `1 <= quantity <= 100000`; `0 < rate <= 999999999.9999`; `0 <= taxRate <= 100` with at most 2 decimals; defaults `taxRate = 10`, `discount = 0`.

Reference example (Appendix A): quantity 2, rate 1000, tax 10, discount 20, AUD gives subTotal 2000.00, tax 200.00, total 2180.00; with totalPaid 1451.34 the balance is 728.66.

Rounding edge example: quantity 3, rate 0.3333, tax 10, AUD gives subTotal round(0.9999) = 1.00, tax 0.10, total 1.10.

### 4.4 Status

Persisted: `Draft`, `Pending`, `Paid`. Derived: `Overdue`.

```
effectiveStatus(persisted, dueDate, today):
  if persisted != Paid and dueDate < today  -> Overdue
  else                                      -> persisted
```

`today = businessDate(clock.now(), BUSINESS_TIMEZONE)` as `YYYY-MM-DD`. The same derivation is applied in SQL for filtering (A-8):

| Filter | SQL predicate |
|---|---|
| Overdue | `status <> 'Paid' AND due_date < :today` |
| Draft | `status = 'Draft' AND due_date >= :today` |
| Pending | `status = 'Pending' AND due_date >= :today` |
| Paid | `status = 'Paid'` |

`:today` is always a bound parameter computed by the application clock, never `CURRENT_DATE`, so tests and the DB agree on the business date.

New invoices are always created `Draft`; `status` is not an accepted input field (mass assignment protection).

### 4.5 Validation rules for create (server side, mirrored on client)

| Field | Rule |
|---|---|
| customer.fullname | required, trimmed, 1 to 200 chars |
| customer.email | required, valid email, max 254, normalized to lowercase |
| customer.mobileNumber | optional, max 32, pattern `^\+?[0-9 ()-]{6,32}$` |
| customer.address | optional, max 500 |
| invoiceNumber | A-10 |
| invoiceReference | optional, max 100 |
| description | optional, max 1000 |
| invoiceDate | required, `YYYY-MM-DD`, real calendar date |
| dueDate | required, `YYYY-MM-DD`, `>= invoiceDate` (message: `dueDate must be on or after invoiceDate`) |
| currency | required, in registry (A-5) |
| items | array of exactly 1 item |
| items[0].name | required, trimmed, 1 to 200 chars |
| items[0].quantity | required, integer, 1 to 100000 |
| items[0].rate | required, decimal string, > 0, <= 999999999.9999, max 4 decimals |
| taxRate | optional, decimal string, 0 to 100, max 2 decimals, default "10" |
| discount | optional, decimal string, >= 0, max currency minor units, <= subTotal (checked in service, 400), default "0" |

Unknown properties are rejected (400). `status`, `createdBy`, totals and `currencySymbol` are never accepted from the client.

## 5. Database design

PostgreSQL 17. Migrations are SQL, committed, and applied with one command. The DDL below is normative: the ORM schema must produce exactly these constraints and indexes (hand-edit the generated migration where the ORM cannot express something, e.g. expression indexes, trigram indexes, triggers).

Primary keys are UUIDs generated by the backend (UUIDv7, time-ordered, for index locality); seeded Appendix A ids are kept as given.

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id                  uuid PRIMARY KEY,
  email               varchar(254) NOT NULL,
  password_hash       varchar(100) NOT NULL,
  fullname            varchar(200) NOT NULL,
  role                varchar(20)  NOT NULL CHECK (role IN ('ACCOUNTANT', 'AUDITOR')),
  failed_login_count  integer      NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until        timestamptz  NULL,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);
CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE invoices (
  id                  uuid PRIMARY KEY,
  invoice_number      varchar(50)   NOT NULL,
  invoice_reference   varchar(100)  NULL,
  invoice_date        date          NOT NULL,
  due_date            date          NOT NULL,
  currency            char(3)       NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  currency_symbol     varchar(8)    NOT NULL,
  description         varchar(1000) NULL,
  status              varchar(10)   NOT NULL CHECK (status IN ('Draft', 'Pending', 'Paid')),
  customer_fullname   varchar(200)  NOT NULL,
  customer_email      varchar(254)  NOT NULL,
  customer_mobile     varchar(32)   NULL,
  customer_address    varchar(500)  NULL,
  tax_rate            numeric(5,2)  NOT NULL CHECK (tax_rate >= 0 AND tax_rate <= 100),
  invoice_sub_total   numeric(19,4) NOT NULL CHECK (invoice_sub_total >= 0),
  total_tax           numeric(19,4) NOT NULL CHECK (total_tax >= 0),
  total_discount      numeric(19,4) NOT NULL CHECK (total_discount >= 0),
  total_amount        numeric(19,4) NOT NULL CHECK (total_amount >= 0),
  total_paid          numeric(19,4) NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
  balance_amount      numeric(19,4) NOT NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  created_by          uuid          NOT NULL REFERENCES users(id),
  CONSTRAINT invoices_due_after_invoice   CHECK (due_date >= invoice_date),
  CONSTRAINT invoices_discount_le_sub     CHECK (total_discount <= invoice_sub_total),
  CONSTRAINT invoices_total_formula       CHECK (total_amount = invoice_sub_total + total_tax - total_discount),
  CONSTRAINT invoices_balance_formula     CHECK (balance_amount = total_amount - total_paid),
  CONSTRAINT invoices_no_overpayment      CHECK (total_paid <= total_amount),
  CONSTRAINT invoices_paid_is_settled     CHECK (status <> 'Paid' OR balance_amount = 0),
  CONSTRAINT invoices_draft_is_unpaid     CHECK (status <> 'Draft' OR total_paid = 0)
);
CREATE UNIQUE INDEX invoices_invoice_number_ci_key ON invoices (lower(invoice_number));
CREATE INDEX invoices_invoice_date_idx   ON invoices (invoice_date, id);
CREATE INDEX invoices_due_date_idx       ON invoices (due_date, id);
CREATE INDEX invoices_total_amount_idx   ON invoices (total_amount, id);
CREATE INDEX invoices_status_due_idx     ON invoices (status, due_date);
CREATE INDEX invoices_created_by_idx     ON invoices (created_by);
CREATE INDEX invoices_number_trgm_idx    ON invoices USING gin (invoice_number gin_trgm_ops);
CREATE INDEX invoices_customer_trgm_idx  ON invoices USING gin (customer_fullname gin_trgm_ops);

CREATE TABLE invoice_items (
  id          uuid PRIMARY KEY,
  invoice_id  uuid          NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  name        varchar(200)  NOT NULL,
  quantity    integer       NOT NULL CHECK (quantity > 0),
  rate        numeric(19,4) NOT NULL CHECK (rate > 0),
  position    smallint      NOT NULL DEFAULT 1 CHECK (position > 0),
  UNIQUE (invoice_id, position)
);

CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES users(id),
  family_id    uuid        NOT NULL,
  token_hash   char(64)    NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  family_expires_at timestamptz NOT NULL,
  revoked_at   timestamptz NULL,
  replaced_by  uuid        NULL REFERENCES refresh_tokens(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  user_agent   varchar(300) NULL,
  ip           inet        NULL
);
CREATE INDEX refresh_tokens_user_idx   ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

CREATE TABLE idempotency_keys (
  user_id          uuid         NOT NULL REFERENCES users(id),
  idempotency_key  varchar(255) NOT NULL,
  request_method   varchar(10)  NOT NULL,
  request_path     varchar(200) NOT NULL,
  request_hash     char(64)     NOT NULL,
  response_status  smallint     NOT NULL,
  response_body    jsonb        NOT NULL,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  expires_at       timestamptz  NOT NULL,
  PRIMARY KEY (user_id, idempotency_key)
);
CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys (expires_at);

CREATE TABLE audit_events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at    timestamptz  NOT NULL DEFAULT now(),
  actor_user_id  uuid         NULL REFERENCES users(id),
  action         varchar(50)  NOT NULL,
  outcome        varchar(10)  NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE')),
  entity_type    varchar(30)  NULL,
  entity_id      varchar(64)  NULL,
  request_id     varchar(64)  NULL,
  ip             inet         NULL,
  user_agent     varchar(300) NULL,
  metadata       jsonb        NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_events_actor_idx  ON audit_events (actor_user_id, occurred_at);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id);

CREATE FUNCTION audit_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;
CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();
ALTER TABLE audit_events ENABLE ALWAYS TRIGGER audit_events_no_update_delete;
ALTER TABLE audit_events ENABLE ALWAYS TRIGGER audit_events_no_truncate;
```

Notes

- Sort indexes carry `id` as the tie-breaker because every list query orders by `<sortColumn> <dir>, id <dir>`; without a unique tie-breaker, offset pagination can repeat or skip rows with equal sort keys.
- Keyword search uses `ILIKE '%' || :kw || '%'` on both columns, served by the trigram GIN indexes. `%`, `_` and `\` in the user keyword are escaped before binding.
- FK columns are indexed explicitly (Postgres does not do it automatically). `invoice_items.invoice_id` is covered by the `(invoice_id, position)` unique index.
- `ON DELETE RESTRICT` everywhere: financial records are never cascade-deleted.
- The CHECK constraints duplicate the domain invariants on purpose (defense in depth): a bug, a manual SQL fix, or a bad seed cannot store an inconsistent invoice.
- Tier-2 `payments` table: see 13.2.

## 6. API contract

Conventions

- JSON only. `Content-Type: application/json`. Request body limit 16 kB.
- Dates: `YYYY-MM-DD` strings. Timestamps: ISO 8601 UTC.
- Money: decimal strings (A-4).
- Every response carries `X-Request-Id` (echoed from the request if it is a valid UUID, otherwise generated).
- Error body (all non-2xx):
  ```json
  { "statusCode": 404, "message": "Invoice not found", "error": "Not Found" }
  ```
  `message` is a string, or an array of strings for validation errors (400). No stack traces, SQL, or internal identifiers are ever returned. 5xx responses always use `"message": "Internal server error"`.

### 6.1 `POST /auth/login` (public)

Request: `{ "email": "demo@example.com", "password": "..." }`

- 200:
  ```json
  {
    "accessToken": "<jwt>",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "user": { "id": "uuid", "email": "demo@example.com", "fullname": "Demo Accountant", "role": "ACCOUNTANT", "permissions": ["invoice:read", "invoice:create"] }
  }
  ```
  Also sets the refresh cookie (7.3).
- 400 validation. 401 `Invalid email or password` (same message for unknown user, wrong password, and locked account). 429 when rate limited.

### 6.2 `POST /auth/refresh` (public, cookie)

Reads the refresh cookie, rotates it, returns the same body as login. 401 if missing, expired, revoked, or reused (reuse revokes the whole family). Requires the `Origin` check (7.3).

### 6.3 `POST /auth/logout` (public, cookie)

Revokes the refresh token family, clears the cookie, 204. Idempotent.

### 6.4 `GET /auth/me` (auth)

200 with the `user` object from 6.1. 401 without a valid token.

### 6.5 `GET /invoices` (auth, `invoice:read`)

| Param | Type | Default | Rules |
|---|---|---|---|
| page | int | 1 | >= 1, <= 100000 |
| pageSize | int | 10 | 1 to 100 |
| sortBy | enum | invoiceDate | invoiceDate, dueDate, totalAmount |
| ordering | enum | DESC | ASC, DESC (case-insensitive input) |
| status | enum | none | Draft, Pending, Paid, Overdue (A-8) |
| keyword | string | none | trimmed, 1 to 100 chars |
| fromDate | date | none | YYYY-MM-DD |
| toDate | date | none | YYYY-MM-DD, >= fromDate |

200:
```json
{
  "data": [
    {
      "invoiceId": "uuid",
      "invoiceNumber": "IV1780488206995",
      "customerName": "Paul",
      "invoiceDate": "2026-06-03",
      "dueDate": "2026-07-03",
      "currency": "AUD",
      "currencySymbol": "AU$",
      "totalAmount": "2180.00",
      "balanceAmount": "728.66",
      "status": "Overdue"
    }
  ],
  "paging": { "page": 1, "pageSize": 10, "total": 41 }
}
```

### 6.6 `GET /invoices/:id` (auth, `invoice:read`)

`:id` must be a UUID (400 otherwise). 404 `Invoice not found`.

200:
```json
{
  "invoiceId": "099ca7da-a290-40fa-93b9-1c43ae7bb887",
  "invoiceNumber": "IV1780488206995",
  "invoiceReference": "#5721662",
  "invoiceDate": "2026-06-03",
  "dueDate": "2026-07-03",
  "currency": "AUD",
  "currencySymbol": "AU$",
  "description": "Invoice is issued to Kanglee",
  "status": "Overdue",
  "customer": { "fullname": "Paul", "email": "paul@101digital.io", "mobileNumber": "947717364111", "address": "Singapore" },
  "items": [ { "id": "b1c2d3e4-0000-0000-0000-000000000001", "name": "Honda RC150", "quantity": 2, "rate": "1000.00" } ],
  "taxRate": "10.00",
  "invoiceSubTotal": "2000.00",
  "totalTax": "200.00",
  "totalDiscount": "20.00",
  "totalAmount": "2180.00",
  "totalPaid": "1451.34",
  "balanceAmount": "728.66",
  "createdAt": "2026-06-03T12:03:26.995Z",
  "createdBy": "ad1e0902-1928-4345-b513-60c86c94fc91"
}
```

`rate` is formatted with the currency minor units, or with more decimals when the stored rate has them (up to 4, trailing zeros beyond minor units trimmed).

### 6.7 `POST /invoices` (auth, `invoice:create`)

Headers: optional `Idempotency-Key` (1 to 255 visible ASCII chars; the SPA always sends a UUID).

Request:
```json
{
  "invoiceNumber": "IV-2026-0001",
  "invoiceReference": "PO-7781",
  "invoiceDate": "2026-09-30",
  "dueDate": "2026-10-30",
  "currency": "AUD",
  "description": "Consulting",
  "customer": { "fullname": "Jane Doe", "email": "jane@example.com", "mobileNumber": "+61 400 000 000", "address": "Sydney" },
  "items": [ { "name": "Consulting hours", "quantity": 10, "rate": "150.00" } ],
  "taxRate": "10",
  "discount": "0"
}
```

Responses:
- 201 with the detail body (6.6) and `Location: /invoices/{id}`.
- 400 validation (incl. `dueDate must be on or after invoiceDate`, `discount must not exceed subTotal`).
- 403 without `invoice:create` (e.g. AUDITOR).
- 409 `Invoice number already exists` (unique violation `23505` on the CI index, mapped in the service; no pre-check race).
- 409 `A request with this Idempotency-Key is being processed` (concurrent duplicate that exceeded the lock timeout, see 7.6).
- 422 `Idempotency-Key has already been used with a different request payload`.

### 6.8 `GET /health` (public)

200 `{ "status": "ok", "db": "up" }`, 503 when the DB is unreachable. Used by Docker health checks. Excluded from Swagger auth.

### 6.9 Swagger

`/api/docs` (UI) and `/api/docs-json`. Bearer auth scheme registered; every endpoint documents request DTOs, query params, success schemas, and error responses (400/401/403/404/409/422/429) using a shared `ErrorResponseDto`. Controlled by `SWAGGER_ENABLED` (default `true` for the assessment).

## 7. Security design

The detailed rationale and sources are in `docs/research/02-security.md`. This section is normative.

### 7.1 Threat model summary

| Asset | Threat | Control |
|---|---|---|
| Credentials | Brute force, credential stuffing | Per-IP throttle on login, per-account lockout, bcrypt cost 12, generic errors |
| Credentials | User enumeration via timing or messages | Dummy bcrypt compare for unknown users, identical 401 message |
| Access token | XSS theft | Token held in memory only, strict CSP, no `dangerouslySetInnerHTML` |
| Access token | Forgery, alg confusion | HS256 with >= 256-bit secret (RFC 7518 s3.2, checked on decoded bytes), algorithms pinned, iss/aud/exp validated (RFC 8725) |
| Access token | Use after logout | `sid` claim checked against revoked sessions on every request |
| Refresh token | Theft and replay | HttpOnly Secure SameSite=Strict cookie, narrow path, rotation, reuse detection revokes family, stored as SHA-256 hash only |
| Refresh endpoint | CSRF | SameSite=Strict + required custom header + `Origin`/`Sec-Fetch-Site` checks + JSON-only |
| Invoices | Unauthorized read or write | Global deny-by-default JWT guard, permission guard, UUID validation |
| Invoices | Mass assignment | DTO whitelist, `forbidNonWhitelisted`, server-owned fields never bound |
| Invoices | Duplicate creation on retry | Idempotency-Key, DB unique index on invoice number |
| Money | Precision and tampering | Server-side decimal calculation, DB CHECK invariants |
| API | Resource exhaustion | pageSize cap 100, body limit 16 kB, keyword length cap, global throttle |
| API | Information leakage | Global filter hides internals, `x-powered-by` off, helmet headers |
| Logs | Secret leakage | pino redaction of `authorization`, `cookie`, `set-cookie`, `password`, tokens |
| Audit trail | Tampering | Append-only table enforced by `ENABLE ALWAYS` triggers (UPDATE, DELETE, TRUNCATE); the API connects as a least-privilege role with only INSERT/SELECT on `audit_events`, so it cannot disable the triggers (section 11.4) |
| Secrets | Committed or hardcoded | env only, validated at startup, `.env` git-ignored, compose generates secrets (11.2) |

### 7.2 Access token (JWT)

- Algorithm HS256, secret `JWT_SECRET` (>= 32 bytes; startup fails otherwise). `verify` is called with `algorithms: ['HS256']`, `issuer`, `audience`.
- Claims: `sub` (user id), `sid` (session id = refresh token `family_id`), `role`, `iss` (`JWT_ISSUER`), `aud` (`JWT_AUDIENCE`), `iat`, `exp`, `jti` (UUID). No email or PII.
- TTL: `JWT_ACCESS_TTL_SECONDS`, default 3600 (assessment requirement). `.env.example` suggests 900 for a tighter setup.
- `JwtAuthGuard` is registered globally (`APP_GUARD`). Routes opt out explicitly with `@Public()`. After signature validation the guard runs one indexed query that loads the user and checks that the session (`sid`) is not revoked. Logout, refresh-token reuse detection, or account removal therefore invalidate outstanding access tokens immediately instead of after up to 3600 s. This is a deliberate hybrid: the token is self-contained, but revocation is checked (documented trade-off).
- `PermissionsGuard` (global) checks `@RequirePermissions(...)` against a static role to permissions map in code. It fails closed: a non-public route needs `@RequirePermissions(...)` or the explicit `@AuthenticatedOnly()` marker (used by `GET /auth/me`), otherwise it answers 403 and writes `ACCESS_DENIED`.

### 7.3 Refresh token and client storage

- On login, the server creates a random 256-bit refresh token (base64url), stores only its SHA-256 hash with a new `family_id`, and sets cookie `si_rt` (name configurable; use `__Secure-si_rt` behind HTTPS; the `__Host-` prefix is not usable because it forces `Path=/`): `HttpOnly; Secure (COOKIE_SECURE); SameSite=Strict; Path=/api/auth (REFRESH_COOKIE_PATH); Max-Age=REFRESH_TOKEN_TTL_SECONDS`.
- `POST /auth/refresh`: in one transaction, lock the token row (`SELECT ... FOR UPDATE`); if revoked or already replaced, this is reuse: revoke the whole family, audit `REFRESH_TOKEN_REUSE_DETECTED`, return 401. Otherwise issue a new token in the same family (`replaced_by` link), revoke the old one, return a new access token. The family has an absolute lifetime (`family_expires_at`, `REFRESH_FAMILY_TTL_SECONDS`) that rotation never extends.
- CSRF (OWASP: SameSite is defense in depth only, never the sole control). Cookie endpoints `/auth/refresh` and `/auth/logout` require all of: header `X-Requested-With: SimpleInvoice` (a custom header forces a CORS preflight that cross-site pages cannot pass), `Origin` (when present) in `ALLOWED_ORIGINS`, and `Sec-Fetch-Site` (when present) equal to `same-origin` or `none`. Otherwise 403.
- Known residual risk (RFC 10017 s6.2, token-mediating backend): XSS in the SPA could still call `/auth/refresh`. The strict CSP and React's escaping are the mitigation; a full BFF would remove it and is noted in limitations.
- The SPA keeps the access token in a module-scoped variable (memory). It is never written to localStorage, sessionStorage, or a readable cookie. On page load the SPA calls `/auth/refresh` once to restore the session.

### 7.4 Login hardening

- Email is trimmed and lowercased before lookup.
- Unknown email: still run `bcrypt.compare` against a precomputed dummy hash (same cost) to equalize timing.
- Progressive per-account throttling (OWASP, NIST SP 800-63B-4), not permanent lockout: after `LOGIN_MAX_FAILED_ATTEMPTS` (default 5) consecutive failures, `locked_until = now + min(30 s * 2^(failures - 5), LOGIN_LOCKOUT_MAX_SECONDS)` (cap default 900). While locked, login returns the same generic 401 without checking the password. Success resets the counter. Unknown emails are covered by the per-IP throttle (per-email counters for non-existent accounts are a noted limitation).
- Per-IP throttle (`@nestjs/throttler`, applied before any hashing): login 10/min, refresh 30/min, global 120/min. `app.set('trust proxy', 1)` and nginx overwrites `X-Forwarded-For` with `$remote_addr`; the API port is not published by default (section 11.1), so through the supported entry point the client IP cannot be spoofed. The login and refresh limits are bound to the route handler, not the URL text, so `/AUTH/LOGIN` or `/auth/login/` count against the same limit.
- bcrypt cost `BCRYPT_COST` (default 12). Passwords over 72 bytes are rejected at validation.

### 7.5 HTTP hardening

- `helmet()` with defaults; Swagger route gets a relaxed CSP only on `/api/docs`.
- `app.disable('x-powered-by')`, JSON body limit 16 kB, JSON only. HSTS only when served over real HTTPS (not on the localhost demo).
- CORS disabled by default (same origin). If `CORS_ORIGINS` is set, only those origins, `credentials: true`.
- nginx: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`, plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `server_tokens off`.
- `ParseUUIDPipe` on `:id`. Query DTOs whitelist every parameter.
- Containers run as non-root; only the web port is published (on `127.0.0.1`), the API and Postgres have no host port by default (section 11.1).
- Every pool connection has `statement_timeout` 15 s, so one slow query cannot hold a connection for long; invoice creation also sets a short `lock_timeout`.

### 7.6 Idempotency (POST /invoices)

Race-safe algorithm, entirely inside the create transaction:

1. `hash = sha256(method + path + canonical JSON body)`.
2. `INSERT INTO idempotency_keys (...) VALUES (...) ON CONFLICT (user_id, idempotency_key) DO UPDATE SET ... WHERE idempotency_keys.expires_at < now RETURNING user_id` with a placeholder response. An expired key is reclaimed in the same atomic statement (never "delete then insert", which two requests could both do), and the API role needs no DELETE right. A concurrent transaction with the same key blocks on the primary key until the first commits or rolls back.
3. If no row was returned, a live key exists: `SELECT` it. If `request_hash` differs, 422. Otherwise roll back and replay the stored `response_status` and `response_body` (with header `Idempotent-Replayed: true`).
4. Otherwise create the invoice, `UPDATE` the key row with the final 201 response, commit.
5. If the business operation fails (4xx/5xx), the transaction rolls back and the key is released, so a corrected retry is allowed.
6. The transaction sets a 5 s lock timeout for itself only (`set_config('lock_timeout', $1, true)`, the same as `SET LOCAL` but with a bound value); a concurrent duplicate that times out waiting on the key (SQLSTATE `55P03`) returns 409 `A request with this Idempotency-Key is being processed`.

Reference: draft-ietf-httpapi-idempotency-key-header-07 (lapsed draft, not an RFC) and Stripe's documented behaviour (validation failures are not stored). See `docs/research/03-money-and-banking.md`.

Keys are scoped per user, retained 24 h (`IDEMPOTENCY_TTL_SECONDS`).

### 7.7 OWASP API Security Top 10 (2023) mapping

| Risk | Control in this app |
|---|---|
| API1 BOLA | Single-tenant by design (A-12); every read goes through one repository with a scope parameter; UUIDv7 ids, never sequential |
| API2 Broken authentication | 7.2 to 7.4 |
| API3 BOPLA | Explicit response DTO mapping (never return entities), whitelist request DTOs |
| API4 Unrestricted resource consumption | pageSize cap, body limit, throttling, keyword length cap |
| API5 BFLA | PermissionsGuard, AUDITOR cannot create (403) |
| API6 Sensitive business flows | Idempotency keys, login lockout |
| API7 SSRF | No outbound calls exist |
| API8 Security misconfiguration | helmet, CSP, env validation, non-root containers, no default secrets |
| API9 Improper inventory | Swagger is the complete inventory; can be disabled per environment |
| API10 Unsafe consumption of APIs | No third-party APIs consumed |

## 8. Frontend design

Stack: React 19, TypeScript (strict), Vite, React Router (data router), TanStack Query, react-hook-form + zod, Tailwind CSS v4 + shadcn/ui, Vitest + Testing Library + MSW. Architecture: Feature-Sliced Design (see `docs/research/04-frontend-guidelines.md` and `.claude/skills/`).

### 8.1 FSD layout

Follows the official FSD v2.1 skill: no `widgets/` layer (discouraged in v2.1), no user entity created only for auth.

```
simple-invoice-web/src/
  app/          providers (QueryClient, Router, Toaster), router + route guards, layouts/app-shell (header, logout), global styles
  pages/        login, invoice-list (incl. its table/cards and filter bar UI), invoice-detail, invoice-create, not-found
  features/     auth-login (form + mutation), auth-logout, invoice-create (form, schema, mutation)
  entities/     invoice (types, api, queryOptions/keys, status badge, money display)
  shared/       api (fetch client, errors), auth (in-memory token + current user store, single-flight refresh), ui (shadcn), lib (money, dates), config (env, routes)
```

Import rule: a layer imports only from layers below it; slices expose a public `index.ts` (no `export *`); no cross-slice imports on the same layer. Enforced with Steiger (`npm run lint:fsd`). Code used by one page stays in that page.

### 8.2 Routes

| Path | Page | Access |
|---|---|---|
| `/login` | Login | public (redirects to `/invoices` when a valid in-memory session exists; after a full page load it shows the form rather than spending a refresh call) |
| `/` | redirect to `/invoices` | protected |
| `/invoices` | Invoice list (home) | protected |
| `/invoices/new` | Create invoice | protected, hidden/disabled without `invoice:create` |
| `/invoices/:id` | Invoice detail | protected |
| `*` | Not found | public |

Protected routes: a loader/guard ensures a session; if the in-memory token is absent it calls `/api/auth/refresh` once (single-flight); on failure it redirects to `/login?redirectTo=<path>`. `redirectTo` is accepted only if it starts with `/` and not `//` (open-redirect protection).

### 8.3 API client

- Base URL `/api` (same origin), `credentials: 'include'` only for `/auth/*`.
- Adds `Authorization: Bearer <token>`.
- On 401 from a protected call: one single-flight refresh, retry once; if it still fails, clear the session and redirect to login.
- Parses the error shape (section 6) into a typed `ApiError` (status, messages[]).

### 8.4 Screens

- Login: email + password, zod validation, disabled submit while pending, generic error banner, no password echo.
- Invoice list: filters live in the URL query string (shareable, back-button safe); keyword debounced 300 ms; status select; sort field + direction; date range; page size (10, 20, 50); pagination controls with total. Table on `md+`, stacked cards on mobile. Status badge colors: Draft grey, Pending amber, Paid green, Overdue red. Loading skeleton, empty state, error state with retry. Row click (and keyboard Enter) opens detail.
- Invoice detail: invoice info, customer, line items, amounts block (subtotal, tax with rate, discount, total, paid, outstanding balance), status badge. 404 state.
- Create invoice: sections Customer, Invoice, Item, Tax and discount. Client validation mirrors 4.5. Money inputs are text inputs with decimal validation (no float coercion). No client-side total calculation (the backend is the only calculator; see tier-2 quote endpoint). `Idempotency-Key` generated once per form mount. On 201: success toast, navigate to `/invoices`. On 409: inline error on invoice number. On 400: map server messages to a banner.
- Money display: `Intl.NumberFormat(locale, { style: 'currency', currency })` fed with the decimal string (no `parseFloat` on money).

## 9. Observability and audit

- Structured JSON logs with `nestjs-pino`; `X-Request-Id` bound to every log line; redaction list in 7.1.
- Unhandled errors are logged as a reduced object: error name, SQLSTATE code, constraint, table, the first line of the driver message and the stack frames. The SQL text and bound values of a failed query (customer names, emails, addresses) are never logged.
- Audit events (table `audit_events`, append-only): `LOGIN_SUCCEEDED`, `LOGIN_FAILED` (metadata: reason code, never the password or the typed email if unknown; store a SHA-256 of the email), `ACCOUNT_LOCKED`, `TOKEN_REFRESHED`, `REFRESH_TOKEN_REUSE_DETECTED`, `LOGOUT`, `INVOICE_CREATED` (metadata: invoiceNumber, totalAmount, currency), `ACCESS_DENIED` (403).
- Audit writes for business events happen in the same transaction as the business write (no event without data, no data without event).

## 10. Configuration

All configuration comes from environment variables, validated at startup (the process exits with a clear message listing invalid keys). `.env.example` documents every key with non-secret placeholders.

| Variable | Default | Notes |
|---|---|---|
| NODE_ENV | development | |
| PORT | 3000 | backend port |
| DATABASE_URL | required | `postgresql://user:pass@host:5432/db` |
| JWT_SECRET | required | >= 32 bytes; `JWT_SECRET_FILE` alternative; with `NODE_ENV=production` the `.env.example` placeholder (and the DB password `change-me`) is refused |
| JWT_ACCESS_TTL_SECONDS | 3600 | assessment requirement; validated 60 to 86400 |
| JWT_ISSUER | simple-invoice-api | |
| JWT_AUDIENCE | simple-invoice-web | |
| REFRESH_TOKEN_TTL_SECONDS | 86400 | idle lifetime of one refresh token |
| REFRESH_FAMILY_TTL_SECONDS | 604800 | absolute session lifetime |
| REFRESH_COOKIE_PATH | /api/auth | browser-visible path through the proxy |
| COOKIE_SECURE | true | set false only for plain-http local dev |
| ALLOWED_ORIGINS | http://localhost:8080,http://localhost:5173 | Origin check for cookie endpoints |
| CORS_ORIGINS | empty | CORS disabled when empty |
| BCRYPT_COST | 12 | |
| LOGIN_MAX_FAILED_ATTEMPTS | 5 | |
| LOGIN_LOCKOUT_MAX_SECONDS | 900 | cap of the progressive delay |
| THROTTLE_LOGIN_LIMIT | 10 | per minute per IP |
| THROTTLE_REFRESH_LIMIT | 30 | per minute per IP |
| THROTTLE_GLOBAL_LIMIT | 120 | per minute per IP |
| REFRESH_COOKIE_NAME | si_rt | `__Secure-si_rt` recommended behind HTTPS |
| IDEMPOTENCY_TTL_SECONDS | 86400 | |
| BUSINESS_TIMEZONE | UTC | IANA name, A-6 |
| SWAGGER_ENABLED | true | |
| LOG_LEVEL | info | |
| SEED_DEMO_PASSWORD | required for seed | demo credential (>= 15 chars, NIST single-factor minimum), documented in README by requirement |
| SEED_ON_START | false (true in compose) | run idempotent seed at container start |
| APP_DB_USER | empty | migrate job only: least-privilege role the API connects as (compose: `simple_invoice_app`); empty means one DB user (local dev) |
| APP_DB_PASSWORD | empty | migrate job only; `APP_DB_PASSWORD_FILE` alternative (compose); 16 to 128 printable ASCII characters |

`COOKIE_SECURE`: browsers treat `http://localhost` as a secure context, so `Secure` cookies work on localhost without TLS; the default stays `true`.

## 11. Packaging and runtime (Docker)

### 11.1 Services

| Service | Image | Host port | Notes |
|---|---|---|---|
| secrets-init | alpine | none | one-shot, writes secrets into the `secrets-owner` and `secrets-app` volumes on first run only |
| db | postgres:17-alpine | none by default | named volume, healthcheck `pg_isready`; opt-in `127.0.0.1:5432` via `docker/compose.db-port.yml` |
| migrate | same image as backend, command `migrate`, uid 1001 | none | one-shot, connects as the schema owner: migrations, then the runtime role and grants (`src/database/runtime-role.ts`), then the optional seed (as the runtime role) |
| backend | built from `simple-invoice-api/Dockerfile`, command `serve` | none by default; opt-in `127.0.0.1:3000` (`BACKEND_HOST_PORT`) via `docker/compose.api-port.yml` | multi-stage, non-root, code owned by root, read-only root filesystem, connects as `simple_invoice_app`, starts only after `migrate` completed successfully; healthcheck `/health` inside the container |
| frontend | built from `simple-invoice-web/Dockerfile` | 127.0.0.1:8080 (`FRONTEND_HOST_PORT`) | Vite build served by unprivileged nginx, read-only root filesystem with tmpfs `/tmp` and `/etc/nginx/conf.d`, proxies `/api/` to backend; the only way in |

`secrets-init`, `migrate`, `backend` and `frontend` drop every Linux capability (`cap_drop: ALL`); `db` keeps the defaults because the postgres entrypoint needs them to initialise its data folder. `ALLOWED_ORIGINS` is derived from `FRONTEND_HOST_PORT`, so changing the port keeps the origin check correct. The API port is not published by default because the API trusts one proxy hop for `X-Forwarded-For` (client IP for throttling and audit); only nginx, which overwrites that header, may reach it. In local dev the Vite proxy sets `X-Forwarded-For` the same way (`xfwd: true`).

### 11.2 Secrets

`docker compose up` must work from a fresh clone with no manual step. A one-shot `secrets-init` service generates random hex values from `/dev/urandom` on first run only (atomic write, per-file owner and mode), in two volumes:

- `secrets-owner`: `db_password` (owner 70, group 1001, 0440). Mounted by `db` (`POSTGRES_PASSWORD_FILE`) and `migrate`.
- `secrets-app`: `app_db_password` (owner 1000, group 1001, 0440) and `jwt_secret` (owner 1000, 0400). Mounted by `migrate` and `backend`.

The backend never mounts the owner password, and the migrate job (uid 1001) cannot read the JWT secret. The migrate job sets the runtime role password on every run, as a SCRAM-SHA-256 verifier computed on the client, so the plain password never reaches the database server or its logs. The config layer builds the connection from `DB_*` values (no `DATABASE_URL` in compose). Nothing secret is committed. The only documented credential is the demo login required by the assessment. (Mechanism background in `docs/research/02-security.md`, section G.)

### 11.3 Running without Docker

Documented in README: start Postgres (any local instance, or `docker compose -f docker-compose.yml -f docker/compose.db-port.yml up db` to publish it on `127.0.0.1:5432`), copy `simple-invoice-api/.env.example` to `simple-invoice-api/.env`, `npm ci && npm run db:migrate && npm run seed && npm run start:dev`; in `simple-invoice-web/`, `npm ci && npm run dev` (Vite proxies `/api` to `http://localhost:3000`).

### 11.4 Database roles

- `simple_invoice` (created by the postgres image, superuser) owns every table and is used only by the one-shot migrate job.
- `simple_invoice_app` is what the API uses: `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`, no role memberships, owns nothing. It has CONNECT on the database (no TEMP) and USAGE on `public` (no CREATE, also revoked from PUBLIC).
- Table grants:
  - SELECT, INSERT, UPDATE on `users`, `refresh_tokens`, `idempotency_keys`;
  - SELECT, INSERT on `invoices`, `invoice_items`, `audit_events`.
- There is no DELETE, and no access to the `drizzle` schema.
- Because only an owner may `ALTER TABLE ... DISABLE TRIGGER` or drop constraints, the audit append-only trigger and the money CHECK constraints hold even if the API is compromised.
- `src/database/runtime-role.ts` applies this idempotently on every start (it revokes anything else first). A new table needs a line there.
- Local dev uses one DB user. To try the split, set `APP_DB_USER` and `APP_DB_PASSWORD` in `.env` and run `npx tsx src/database/runtime-role.ts` after `npm run db:migrate`.

## 12. Testing strategy

Backend (Jest):

- Unit, pure domain: `invoice-calculator.spec.ts` (Appendix A example, rounding half-up, JPY zero decimals, discount cap, tax 0 and 100, large values), `invoice-status.spec.ts` (due today not overdue, yesterday overdue, Paid never overdue, Draft can be overdue, timezone boundary), `money.spec.ts`, `currency-registry.spec.ts`.
- Unit, validation: `create-invoice.dto.spec.ts` (due date before invoice date message, unknown field rejected, money string patterns, exactly one item), `list-invoices-query.dto.spec.ts` (pageSize cap, ordering case, fromDate > toDate).
- Unit, services: `invoices.service.spec.ts` (unique violation mapped to 409, Draft on create, createdBy from principal), `auth.service.spec.ts` (dummy compare for unknown user, lockout, reset on success), `token.service.spec.ts` (claims, pinned alg), refresh rotation and reuse detection, `all-exceptions.filter.spec.ts` (shape, no leak on 500).
- Integration/e2e (Jest + supertest + Testcontainers PostgreSQL, real migrations): login, 401 without token, create then find in list (key workflow), detail matches, 409 duplicate invoice number (case-insensitive), 400 due date, 403 auditor create, status filter Overdue vs Pending consistency, sort and pagination, idempotent replay and 422 on payload mismatch, refresh rotation and reuse detection.

Frontend (Vitest + Testing Library + MSW):

- `login-form.test.tsx`: validation messages, submit, error banner.
- `protected-route.test.tsx`: redirect to login when refresh fails; `redirectTo` sanitization.
- `invoice-list-page.test.tsx`: renders rows, filter changes update URL and request params, empty and error states.
- `invoice-detail-page.test.tsx`: renders amounts and status, 404.
- `invoice-create-form.test.tsx`: required fields, due date rule, submit success toast and navigation, 409 inline error.
- `money.test.ts`, `api-client.test.ts` (401 then single refresh then retry).

## 13. Value-add scope tiers

### 13.1 Tier 1 (in scope, built with the core)

Refresh token rotation with reuse detection, login lockout and throttling, RBAC with an AUDITOR role, idempotency keys, append-only audit log, DB CHECK invariants, decimal-safe money with currency minor units, business-date clock, request ids and redacted structured logs, health endpoint, generated secrets in compose.

### 13.2 Tier 2 (only after tier 1 is green)

- `POST /invoices/quote`: server-side total preview for the create form (no persistence), so the UI can show totals without calculating them on the client.
- Invoice lifecycle and settlement: `POST /invoices/:id/issue` (Draft to Pending) and `POST /invoices/:id/payments` (`Idempotency-Key` required; amount <= balance; row lock `SELECT ... FOR UPDATE`; append-only `payments` ledger; `total_paid` and `balance_amount` updated in the same transaction; status becomes Paid when balance reaches zero; DB constraint `total_paid = sum(payments)` verified by a reconciliation query in tests).
- Maker-checker: issuing requires a user other than the creator.

### 13.3 Out of scope

Multi-currency FX, multiple line items in the UI, invoice edit/delete, PDF export, email delivery, MFA, password reset.

## 14. Known limitations

- Offset pagination (required by the contract) degrades on deep pages and can shift under concurrent inserts; keyset pagination would be used at scale.
- Single-tenant visibility (A-12).
- Every authenticated request costs one indexed lookup (user plus live session `sid`, section 7.2). That is what makes logout and refresh-token reuse cut off access tokens at once; a cache would be needed at high traffic.
- Two browser tabs that refresh at the same instant would look like token reuse and end the session. The SPA serialises refresh across tabs with the Web Locks API; a client without it (old browser) can still hit this.
- Throttling state is in memory (single instance); a shared store (Redis) is needed for horizontal scaling.
- Idempotency keys expire logically after 24 h but are not purged by a scheduled job.
- The SPA uses a token-mediating backend pattern (RFC 10017 s6.2) because the contract requires a JWT-returning login; a BFF (tokens never reach JavaScript) is the stronger pattern for high-value apps.
- The secrets volume and the database volume must be removed together (`docker compose down -v`): `POSTGRES_PASSWORD_FILE` is only read when the data directory is first initialized.
- HS256 is a shared secret; asymmetric signing (EdDSA) with key rotation (`kid`) would be used when other services verify tokens.

The adversarial security review (a second pass before delivery) found these smaller points. Each one is known and accepted for this assessment; the fix a real deployment would make is given in brackets.

- Swagger UI stays on (`SWAGGER_ENABLED=true`) so reviewers can try the API. Its page is served on the SPA origin through nginx and needs inline scripts, so an XSS bug in Swagger UI itself would run with the SPA's origin. [Set `SWAGGER_ENABLED=false` in production, or serve it on a separate origin with a nonce-based CSP.]
- Login timing: for a known email, reserving the login attempt adds one short database transaction (1 to 3 ms against about 200 ms of bcrypt). With many samples this may hint that an email exists; the per-IP and per-account throttles slow such probing. [Run a matching dummy round trip for unknown emails.]
- Audit rows store an unsalted SHA-256 of the email for failed logins; a list of candidate emails can reverse it. [Use an HMAC with a server-side key.]
- A client may send its own `X-Request-Id` (a UUID) and it is stored in logs and audit rows, so a client can confuse log correlation for its own requests. [Always generate the id on the server and keep the client value in a separate field.]
- `GET /health` is public, not throttled, and runs `SELECT 1`. [Serve it on an internal port or cache the result.]
- Refresh has no grace period: if a refresh response is lost after the server rotated the token, the next refresh looks like reuse and the session ends (the accepted RFC 9700 trade-off).
- Logout accepts any token of the family, including an already rotated one, so a holder of an old stolen token can end the victim's session (denial of service only, and it also removes the thief's access).
- The SPA route guard does not clear the query cache when a background refresh fails (logout and the API 401 path do). With single-tenant visibility (A-12) nothing leaks between users today.
- A JSON syntax error message repeats a small part of the request body back to the sender only.
- Access logs include the query string, so a `keyword` (for example a customer name) can appear in logs. [Log the path only, or redact query values.]
- The demo password default is visible with `docker inspect`; it is a public demo credential by design (brief 2.3.3).
- The refresh cookie has no `__Host-` prefix by default (it needs `Path=/`, which conflicts with `Path=/api/auth`), and nginx sends no HSTS because the demo runs on plain `http://localhost`. [Enable HSTS and TLS at the edge in a real deployment.]
- The CSP allows `style-src 'unsafe-inline'`, which the UI library needs. The risk is CSS injection only; React escapes all text output.
- Images are pinned by tag, not by digest. [Pin digests in a production pipeline.]
