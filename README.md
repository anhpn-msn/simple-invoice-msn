# SimpleInvoice

Take-home assessment for 101 Digital: login, invoice list (search, filters, sort, paging), invoice detail and invoice creation, built with a core-banking mindset (exact money, exactly-once creation, audited and revocable sessions). One repository holds the NestJS API, the React app, the documents and the Docker Compose file that runs the whole stack.

Contents: [Quick start](#quick-start) | [Docker details](#docker-details) | [Project structure](#project-structure) | [Architecture](#architecture) | [Local development without Docker](#local-development-without-docker) | [Seed script](#seed-script) | [Testing](#testing) | [Design decisions](#design-decisions) | [Security highlights](#security-highlights) | [Known limitations](#known-limitations)

## Quick start

Requirements: Docker with Compose v2.

```bash
git clone <repo-url> simple-invoice
cd simple-invoice
docker compose up -d --build
```

No `.env` file and no manual secret step are needed: secrets are generated on the first run, and the demo password has a default. The first start builds the images, migrates the database and seeds the demo data before the API starts.

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

## Docker details

On the first start a one-shot `secrets-init` container generates random database passwords (one for the schema owner, one for the app) and a JWT secret into two Docker volumes. A one-shot `migrate` container then migrates the schema, creates the least-privilege app role `simple_invoice_app`, and seeds the demo data. The API starts only after that job has finished successfully, and it connects as `simple_invoice_app`, never as the owner.

### Options

Run every command from the repository root. The variables below can also be set in a `.env` file next to `docker-compose.yml` (see [`.env.example`](.env.example)).

| Need | How |
|---|---|
| Port 8080 already taken | `FRONTEND_HOST_PORT=8081 docker compose up`. The backend origin check follows `FRONTEND_HOST_PORT` automatically. Open the app via `localhost`, not `127.0.0.1`, because the origin must match. |
| Call the API directly (no nginx), for example with Postman | `docker compose -f docker-compose.yml -f docker/compose.api-port.yml up -d` publishes it on `127.0.0.1:3000` (`BACKEND_HOST_PORT` to change); Swagger is then also at http://localhost:3000/api/docs. Local debugging only: on this port the API trusts the `X-Forwarded-For` header, so the client IP used for rate limits and the audit log can be faked. |
| Connect a SQL client to the database | `docker compose -f docker-compose.yml -f docker/compose.db-port.yml up -d` publishes it on `127.0.0.1:5432` (`DB_HOST_PORT` to change). Log in as the owner `simple_invoice`; its password is in the owner secrets volume: `docker compose exec db cat /run/secrets-owner/db_password`. The API container cannot read it. |
| Start from zero | `docker compose down -v`. This removes the database volume and both secrets volumes together. Always remove the database and owner secrets volumes together: PostgreSQL only reads the owner password when the data folder is first created. The app password is set again on every start, so it can never get out of sync. |

Image tags are pinned (for example `postgres:17-alpine`, `alpine:3.22`), not digests. A production pipeline would pin digests.

### Containers and database role

- **Containers**: non-root users, Linux capabilities dropped (except the postgres image), read-only file system for the API, the migrate job and the nginx frontend, generated secrets with per-file permissions in two volumes (the API never sees the owner password), only the web port published and bound to `127.0.0.1`.
- **Database role**: the API connects as `simple_invoice_app`, which is not a superuser, owns nothing, and has only SELECT/INSERT (plus UPDATE on users, refresh tokens and idempotency keys). It cannot disable the audit trigger, change or delete audit rows, drop constraints or create tables. Migrations run in a separate one-shot container as the owner.

## Project structure

```
simple-invoice/
├── backend/            # NestJS API
├── frontend/           # React SPA
├── docs/               # SPEC.md, ARCHITECTURE.md, DECISIONS.md, research/, assessment.txt
├── docker/             # compose.api-port.yml, compose.db-port.yml, secrets-init.sh
├── docker-compose.yml  # build contexts ./backend and ./frontend
├── .env.example        # compose-only overrides (SEED_DEMO_PASSWORD, FRONTEND_HOST_PORT, BACKEND_HOST_PORT, DB_HOST_PORT)
└── .gitignore
```

This is a monorepo (one repository for both apps) because the reviewers asked for it; the brief allows either a monorepo or two repos. There is no workspace tooling (no npm workspaces, Nx or Turborepo), so each app keeps its own `package.json` and `package-lock.json` and runs its own npm scripts from inside its folder. The frontend talks to the backend only over HTTP ([D-01](docs/DECISIONS.md)).

| Where | What it contains |
|---|---|
| [`backend/README.md`](backend/README.md) | The API: local development without Docker, scripts, API routes, security highlights, assumptions and known limitations. |
| [`frontend/README.md`](frontend/README.md) | The web app: development server, scripts, structure, screens, security. |
| [`docs/SPEC.md`](docs/SPEC.md) | The specification: requirements traceability, assumptions (section 2), API contract, database, security design. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Diagrams of the system, the login/refresh flows and exactly-once invoice creation. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Every library and design choice, compared with the alternatives, in plain English. |
| [`docs/research/`](docs/research) | The evidence behind the decisions (versions, security, money handling, frontend rules). |

## Architecture

- The browser talks to one origin only. The `frontend` container runs an unprivileged nginx that serves the React app and reverse-proxies `/api/*` to the API (prefix stripped), so the refresh cookie is first-party and CORS stays off.
- The NestJS API is stateless apart from PostgreSQL 17. It exposes exactly the routes in the brief (`/auth/*`, `/invoices*`) plus `/health` and Swagger at `/api/docs`.
- A one-shot `migrate` job runs as the schema owner: migrations, then the runtime role and its grants, then the optional seed. The API starts only after it succeeded.
- The API connects to PostgreSQL as `simple_invoice_app`, a least-privilege role. Only the `migrate` job uses the owner account.
- A one-shot `secrets-init` job writes random secrets into two volumes, so the API never sees the owner password. Nothing secret is committed.

Diagrams (system, module layers, login and refresh flows, exactly-once invoice creation): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Backend module layout: [`docs/SPEC.md`](docs/SPEC.md) section 3.2. Frontend layout: section 8.1.

## Local development without Docker

Requirements: Node 24 LTS, npm, and a PostgreSQL 17 server.

1. Start PostgreSQL. Any local instance works. Two quick ways:

   - A throwaway container that matches `backend/.env.example`:

     ```bash
     docker run -d --name si-pg -p 127.0.0.1:5432:5432 \
       -e POSTGRES_USER=simple_invoice -e POSTGRES_PASSWORD=change-me -e POSTGRES_DB=simple_invoice \
       postgres:17-alpine
     ```

   - The database from this repository's compose file, published on `127.0.0.1:5432` (`DB_HOST_PORT` to change), started from the repository root:

     ```bash
     docker compose -f docker-compose.yml -f docker/compose.db-port.yml up -d db
     ```

     Its password is generated: read it with `docker compose exec db cat /run/secrets-owner/db_password` and put it in `DATABASE_URL` in `backend/.env`.

2. Configure and start the API, from the `backend/` folder:

   ```bash
   cp .env.example .env
   # edit .env: set JWT_SECRET (e.g. `openssl rand -base64 48`) and SEED_DEMO_PASSWORD
   npm ci
   npm run db:migrate
   npm run seed
   npm run start:dev
   ```

   The API reads `backend/.env`. The seed uses `SEED_DEMO_PASSWORD` from that file. If you keep the placeholder from `backend/.env.example`, that placeholder becomes the demo password.

3. Start the web app, from the `frontend/` folder:

   ```bash
   npm ci
   npm run dev
   ```

   Open http://localhost:5173. Vite proxies `/api` to `http://localhost:3000`. Details: [`frontend/README.md`](frontend/README.md).

## Seed script

`npm run seed` (in `backend/`) fills the database with demo data. In Docker the `migrate` job runs it for you.

- **What it creates**: 2 users (`demo@example.com` as ACCOUNTANT and `auditor@example.com` as AUDITOR), the example invoice from Appendix A of the brief, and 40 generated invoices. A fixed random seed and fixed counts per status make the data the same on every machine, with every status (including Overdue) present. Dates are relative to the business date, so Overdue invoices exist whenever you seed a new database.
- **Idempotent**: running it twice is safe. Ids and invoice numbers never change and existing rows are skipped. The example invoice totals are checked against the brief (2000.00, 200.00, 20.00, 2180.00); if they differ, the seed stops with an error.
- **`SEED_DEMO_PASSWORD`**: required, 15 to 72 bytes, no default in the code. In Docker Compose it falls back to the public demo value `SimpleInvoice-Demo-2026`.
- **`SEED_RESET_PASSWORDS`**: an existing user keeps their password. Set `SEED_RESET_PASSWORDS=true` once to reset the demo passwords and clear any login lock.
- **`SEED_ON_START`**: `true` in Docker Compose (the `migrate` job seeds), `false` by default for local development.

Reasons: [D-44](docs/DECISIONS.md) and [D-45](docs/DECISIONS.md).

## Testing

Run each command inside its own folder, after `npm ci`.

| Folder | Command | What it runs |
|---|---|---|
| `backend/` | `npm test` | Unit tests (Jest) |
| `backend/` | `npm run test:e2e` | End-to-end tests against a real PostgreSQL 17 started by Testcontainers (Docker must be running) |
| `backend/` | `npm run lint` | ESLint |
| `backend/` | `npm run build` | Compile to `dist/` |
| `frontend/` | `npm test` | Unit and component tests (Vitest + Testing Library, MSW mocks the API) |
| `frontend/` | `npm run lint` | ESLint |
| `frontend/` | `npm run lint:fsd` | Steiger: Feature-Sliced Design rules (layers, public APIs) |
| `frontend/` | `npm run build` | Type check and production build to `dist/` |

The test plan is in [`docs/SPEC.md`](docs/SPEC.md) section 12. More scripts: [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md).

## Design decisions

The full list, with the alternatives and the reasons, is in [`docs/DECISIONS.md`](docs/DECISIONS.md). The key ones:

- **One monorepo without workspace tooling**: one clone and one `docker compose up`, and each app keeps its own lockfile ([D-01](docs/DECISIONS.md)).
- **Money as decimal strings**: `NUMERIC(19,4)` in the database, `decimal.js` in the API, strings in JSON, never a floating point number. The server calculates every total and the database re-checks the formula with CHECK constraints ([D-13](docs/DECISIONS.md)).
- **Overdue is derived, never stored**: calculated at read time from the business date ([D-14](docs/DECISIONS.md)).
- **Auth design**: a short JWT access token kept only in browser memory, a rotated refresh token in an `HttpOnly` cookie, a session check on every request so logout is instant ([D-18](docs/DECISIONS.md), [D-19](docs/DECISIONS.md), [D-36](docs/DECISIONS.md)).
- **Idempotency**: `POST /invoices` needs an `Idempotency-Key`, so a retry never creates a second invoice ([D-24](docs/DECISIONS.md)).
- **Append-only audit log**: database triggers block changes to `audit_events`, and the audit row is written in the same transaction as the business write ([D-25](docs/DECISIONS.md)).
- **Least-privilege database role**: the API cannot disable the audit trigger or change the schema; migrations run in a separate one-shot job ([D-58](docs/DECISIONS.md)).
- **Secrets generated on first start**: nothing secret is committed, and `docker compose up` works with no manual step ([D-27](docs/DECISIONS.md)).
- **Frontend architecture**: React 19 + Vite with Feature-Sliced Design v2.1, checked by the Steiger linter ([D-30](docs/DECISIONS.md)).

## Security highlights

- **Money** is never a floating point number, and the server calculates every total.
- **Exactly-once creation** with `Idempotency-Key`; a retry returns the stored response, the same key with a different body returns `422`.
- **Sessions**: HS256 access token (issuer and audience pinned) in browser memory only; refresh token in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie, rotated on every use. Reusing an old refresh token revokes the whole session.
- **Login**: bcrypt cost 12, same answer and same timing for unknown users, progressive slow-down per account, rate limit per IP.
- **Authorization**: deny-by-default guards, role permissions (ACCOUNTANT, AUDITOR).
- **Audit**: logins, failures, lockouts, token reuse, logouts, invoice creation and access denials go to an append-only table.
- **HTTP**: helmet headers, strict CSP on the frontend, 16 kB body limit, strict validation, no stack traces in responses, secrets never logged.
- **Containers and database**: see "Containers and database role" above.

The full security design is in [`docs/SPEC.md`](docs/SPEC.md) section 7, and the backend summary is in [`backend/README.md`](backend/README.md).

## Known limitations

The complete list, with the fix a real deployment would make, is in [`docs/SPEC.md`](docs/SPEC.md) section 14. In short:

- Offset pagination (required by the contract) degrades on deep pages; keyset pagination would be used at scale.
- Single tenant: every signed-in user with `invoice:read` sees all invoices.
- Rate limits are kept in memory (one API instance only); a shared store such as Redis is needed to scale out.
- Idempotency keys expire logically after 24 hours but no job purges them.
- HS256 is a shared secret; asymmetric signing with key rotation would be used if other services had to verify tokens.
- The SPA keeps the access token in JavaScript memory because the brief requires a JWT-returning login; a Backend-for-Frontend is the stronger pattern for high-value apps.
- Refresh has no grace period, and two tabs refreshing at the same instant can end the session on browsers without the Web Locks API.
- Swagger UI stays on for reviewers (`SWAGGER_ENABLED=false` in production), and images are pinned by tag, not by digest.
- Out of scope: multi-currency FX, multiple line items in the UI, invoice edit or delete, PDF export, email delivery, MFA and password reset. The tier 2 ideas in SPEC section 13.2 (quote endpoint, invoice lifecycle and payments, maker-checker) are not part of the delivered API.
