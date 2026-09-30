# SimpleInvoice API

Backend for the 101 Digital SimpleInvoice assessment: login, invoice list, invoice detail and invoice creation, built with a core-banking mindset (exact money, exactly-once creation, audited and revocable sessions).

- NestJS 11, TypeScript 5.9 (strict), Node 24 LTS
- PostgreSQL 17, Drizzle ORM, SQL migrations
- Swagger (OpenAPI) at `/api/docs`

The frontend lives in a second repository, [`simple-invoice-web`](../simple-invoice-web). This repository also holds the `docker-compose.yml` that runs the whole stack, because it owns the database.

## Documents

| File | What it contains |
|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | The specification: requirements traceability, assumptions, API contract, database, security design. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Diagrams of the system, the login/refresh flows and exactly-once invoice creation. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Every library and design choice, compared with the alternatives, in plain English. |
| [`docs/research/`](docs/research) | The evidence behind the decisions (versions, security, money handling, frontend rules). |

## Quick start (Docker, whole stack)

Requirements: Docker with Compose v2. Clone both repositories side by side:

```
workspace/
  simple-invoice-api/   (this repo)
  simple-invoice-web/
```

Then:

```bash
cd simple-invoice-api
docker compose up --build
```

No `.env` file and no manual secret step are needed. On the first start a one-shot `secrets-init` container generates random database passwords (one for the schema owner, one for the app) and a JWT secret into two Docker volumes. A one-shot `migrate` container then migrates the schema, creates the least-privilege app role `simple_invoice_app`, and seeds the demo data. The API starts only after that job has finished successfully, and it connects as `simple_invoice_app`, never as the owner.

| What | URL |
|---|---|
| Web app | http://localhost:8080 |
| API (through nginx) | http://localhost:8080/api (for example http://localhost:8080/api/health) |
| Swagger UI | http://localhost:8080/api/docs |

All ports are bound to `127.0.0.1` only. nginx is the only way in: the API and the database have no host port by default (see "Options" below).

### Demo accounts

| Email | Password | Role | Can do |
|---|---|---|---|
| `demo@example.com` | `SimpleInvoice-Demo-2026` | ACCOUNTANT | list, view, create invoices |
| `auditor@example.com` | `SimpleInvoice-Demo-2026` | AUDITOR | list and view only (create returns `403`) |

This password is a public demo value, required by the brief so a reviewer can log in. It is not a secret. Change it with `SEED_DEMO_PASSWORD=... docker compose up` (at least 15 characters). To change the password of users that already exist, also set `SEED_RESET_PASSWORDS=true` once.

After 5 wrong passwords an account is slowed down (30 s, then doubling up to 15 min). Restarting the stack does not clear it; wait, or run the seed with `SEED_RESET_PASSWORDS=true`.

### Options

| Need | How |
|---|---|
| Port 8080 already taken | `FRONTEND_HOST_PORT=8081 docker compose up`. The backend origin check follows `FRONTEND_HOST_PORT` automatically. Open the app via `localhost`, not `127.0.0.1`, because the origin must match. |
| Call the API directly (no nginx), for example with Postman | `docker compose -f docker-compose.yml -f docker/compose.api-port.yml up` publishes it on `127.0.0.1:3000` (`BACKEND_HOST_PORT` to change); Swagger is then also at http://localhost:3000/api/docs. Local debugging only: on this port the API trusts the `X-Forwarded-For` header, so the client IP used for rate limits and the audit log can be faked. |
| Connect a SQL client to the database | `docker compose -f docker-compose.yml -f docker/compose.db-port.yml up` publishes it on `127.0.0.1:5432` (`DB_HOST_PORT` to change). Log in as the owner `simple_invoice`; its password is in the owner secrets volume: `docker compose exec db cat /run/secrets-owner/db_password`. The API container cannot read it. |
| Web repo in another folder | `WEB_CONTEXT=/path/to/simple-invoice-web docker compose up --build` |
| Start from zero | `docker compose down -v`. This removes the database volume and both secrets volumes together. Always remove the database and owner secrets volumes together: PostgreSQL only reads the owner password when the data folder is first created. The app password is set again on every start, so it can never get out of sync. |

Image tags are pinned (for example `postgres:17-alpine`, `alpine:3.22`), not digests. A production pipeline would pin digests.

## Running without Docker

Requirements: Node 24 LTS, npm, and a PostgreSQL 17 server.

1. Start PostgreSQL. Any local instance works; the fastest is a throwaway container that matches `.env.example`:

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

   The seed uses `SEED_DEMO_PASSWORD` from `.env`. If you keep the placeholder from `.env.example`, that placeholder becomes the demo password.

3. Start the web app from `simple-invoice-web` (`npm ci && npm run dev`, see its README) and open http://localhost:5173. Vite proxies `/api` to `http://localhost:3000`.

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
- **Containers**: non-root users, Linux capabilities dropped (except the postgres image), read-only file system for the API, the migrate job and the nginx frontend, generated secrets with per-file permissions in two volumes (the API never sees the owner password), only the web port published and bound to `127.0.0.1`.
- **Database role**: the API connects as `simple_invoice_app`, which is not a superuser, owns nothing, and has only SELECT/INSERT (plus UPDATE on users, refresh tokens and idempotency keys). It cannot disable the audit trigger, change or delete audit rows, drop constraints or create tables. Migrations run in a separate one-shot container as the owner.

Details and the reasons behind each choice: `docs/SPEC.md` section 7 and `docs/DECISIONS.md`.

## Assumptions

The brief leaves some points open. Each choice is listed in `docs/SPEC.md` section 2 with its reason; the main ones:

- Discount is an amount in the invoice currency (not a percentage) and cannot be larger than the subtotal.
- Tax is calculated on the subtotal before the discount, as the brief's formula says.
- Money in JSON is a string (`"2180.00"`), not a number, so no client loses precision.
- "Today" (for Overdue) is the date in `BUSINESS_TIMEZONE` (default UTC). A due date equal to today is not overdue. Overdue is never stored, it is calculated at read time, also for Drafts.
- The status filter uses the status the user sees: filtering `Pending` does not return invoices shown as `Overdue`.
- Invoice numbers are unique without case (`IV-001` equals `iv-001`).
- Customer details are stored on the invoice as a snapshot, because an issued invoice must not change later.
- All logged-in users see all invoices (single tenant).

## Known limitations

See `docs/SPEC.md` section 14. In short: offset pagination (required by the contract), in-memory rate limits (one instance only), idempotency keys are not purged by a job, and HS256 would move to asymmetric keys if other services had to verify tokens.
