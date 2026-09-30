# SimpleInvoice API

Backend for the 101 Digital SimpleInvoice assessment: login, invoice list, invoice detail and invoice creation, built with a core-banking mindset (exact money, exactly-once creation, audited and revocable sessions).

- NestJS 11, TypeScript 5.9 (strict), Node 24 LTS
- PostgreSQL 17, Drizzle ORM, SQL migrations
- Swagger (OpenAPI) at `/api/docs`

The frontend is in [`../frontend`](../frontend) and the `docker-compose.yml` that runs the whole stack is at the repository root. The Docker quick start, URLs, demo accounts, compose options and "start from zero" are in the [root README](../README.md). This file covers the API only.

## Documents

The documents live in [`../docs/`](../docs), shared by both apps.

| File | What it contains |
|---|---|
| [`../docs/SPEC.md`](../docs/SPEC.md) | The specification: requirements traceability, assumptions, API contract, database, security design. |
| [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) | Diagrams of the system, the login/refresh flows and exactly-once invoice creation. |
| [`../docs/DECISIONS.md`](../docs/DECISIONS.md) | Every library and design choice, compared with the alternatives, in plain English. |
| [`../docs/research/`](../docs/research) | The evidence behind the decisions (versions, security, money handling, frontend rules). |

## Running without Docker

Requirements: Node 24 LTS, npm, and a PostgreSQL 17 server. Run the commands in this section from the `backend/` folder.

1. Start PostgreSQL. Any local instance works; the fastest is a throwaway container that matches `backend/.env.example`:

   ```bash
   docker run -d --name si-pg -p 127.0.0.1:5432:5432 \
     -e POSTGRES_USER=simple_invoice -e POSTGRES_PASSWORD=change-me -e POSTGRES_DB=simple_invoice \
     postgres:17-alpine
   ```

2. Configure and start the API:

   ```bash
   cp .env.example .env
   # edit .env: set JWT_SECRET (e.g. `openssl rand -base64 48`) and SEED_DEMO_PASSWORD
   npm ci
   npm run db:migrate
   npm run seed
   npm run start:dev
   ```

   The API reads `backend/.env`. The seed uses `SEED_DEMO_PASSWORD` from that file. If you keep the placeholder from `backend/.env.example`, that placeholder becomes the demo password.

3. Start the web app from the `frontend/` folder (`npm ci && npm run dev`, see [its README](../frontend/README.md)) and open http://localhost:5173. Vite proxies `/api` to `http://localhost:3000`.

## Scripts

| Script | What it does |
|---|---|
| `npm run start:dev` | API with reload on change |
| `npm run build` | Compile to `dist/` |
| `npm test` | Unit tests (Jest) |
| `npm run test:e2e` | End-to-end tests against a real PostgreSQL 17 started by Testcontainers (Docker must be running) |
| `npm run lint` | ESLint + Prettier check |
| `npm run db:generate` | Generate a SQL migration from the Drizzle schema |
| `npm run db:migrate` | Apply migrations |
| `npm run seed` | Idempotent demo seed: 2 users, the Appendix A invoice, 40 generated invoices |

## API

The routes are exactly the ones in the brief. Full request and response schemas are in Swagger.

| Method | Path | Access |
|---|---|---|
| POST | `/auth/login` | public, rate limited |
| POST | `/auth/refresh` | refresh cookie + CSRF header |
| POST | `/auth/logout` | refresh cookie + CSRF header |
| GET | `/auth/me` | bearer token |
| GET | `/invoices` | `invoice:read` |
| GET | `/invoices/:id` | `invoice:read` |
| POST | `/invoices` | `invoice:create`, `Idempotency-Key` header required |
| GET | `/health` | public |

Every error has the shape `{ "statusCode": 400, "message": "...", "error": "Bad Request" }`.

## Security highlights

- **Money** is never a floating point number: `NUMERIC(19,4)` in the database, `decimal.js` in code, decimal strings in JSON, ISO 4217 minor units with half-up rounding. The server calculates every total; the database re-checks the formula with CHECK constraints.
- **Exactly-once creation**: `POST /invoices` needs an `Idempotency-Key`. A retry returns the stored response (`Idempotent-Replayed: true`), the same key with a different body returns `422`.
- **Sessions**: short JWT access token (HS256, issuer and audience pinned) kept only in browser memory; refresh token in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie, rotated on every use. Reusing an old refresh token revokes the whole session. Every request checks that the session is still live, so logout takes effect at once.
- **Login**: bcrypt cost 12, same answer and same timing for unknown users, progressive slow-down per account, rate limit per IP.
- **Authorization**: deny-by-default guards, role permissions (ACCOUNTANT, AUDITOR).
- **Audit**: logins, failures, lockouts, token reuse, logouts, invoice creation and access denials are written to an append-only `audit_events` table.
- **HTTP**: helmet headers, 16 kB body limit, strict validation (unknown fields rejected), no stack traces in responses, request id on every log line, secrets never logged.
- **Containers and database role**: non-root, read-only, capability-dropped containers and a least-privilege database user (`simple_invoice_app`) for the API. See the [root README](../README.md).

Details and the reasons behind each choice: [`../docs/SPEC.md`](../docs/SPEC.md) section 7 and [`../docs/DECISIONS.md`](../docs/DECISIONS.md).

## Assumptions

The brief leaves some points open. Each choice is listed in [`../docs/SPEC.md`](../docs/SPEC.md) section 2 with its reason; the main ones:

- Discount is an amount in the invoice currency (not a percentage) and cannot be larger than the subtotal.
- Tax is calculated on the subtotal before the discount, as the brief's formula says.
- Money in JSON is a string (`"2180.00"`), not a number, so no client loses precision.
- "Today" (for Overdue) is the date in `BUSINESS_TIMEZONE` (default UTC). A due date equal to today is not overdue. Overdue is never stored, it is calculated at read time, also for Drafts.
- The status filter uses the status the user sees: filtering `Pending` does not return invoices shown as `Overdue`.
- Invoice numbers are unique without case (`IV-001` equals `iv-001`).
- Customer details are stored on the invoice as a snapshot, because an issued invoice must not change later.
- All logged-in users see all invoices (single tenant).

## Known limitations

See [`../docs/SPEC.md`](../docs/SPEC.md) section 14. In short: offset pagination (required by the contract), in-memory rate limits (one instance only), idempotency keys are not purged by a job, and HS256 would move to asymmetric keys if other services had to verify tokens.
