# SimpleInvoice: Decisions and Why

This document lists every important choice we made: libraries, design, and security. For each one it shows the other options we looked at, and why we picked ours.

How to read it:

- The language is kept simple on purpose. When a technical word is needed, a short explanation follows in brackets, like this: "ORM (a library that lets code work with the database using functions instead of writing SQL by hand)".
- "We" means the engineer who built the project.
- The exact rules are in `SPEC.md`. The evidence (sources, version checks) is in `docs/research/`.
- All versions were checked on the npm registry and official docs on 2026-09-30.

Contents:

1. Project shape
2. Backend stack
3. Database and money
4. Security
5. Frontend
6. Testing and delivery

---

## 1. Project shape

### D-01 One monorepo without workspace tooling

A monorepo is one repository that holds several projects together. Workspace tooling (npm workspaces, Nx, Turborepo) is extra software that manages the projects of a monorepo as one unit: it shares one set of installed packages and one lockfile (the file that records the exact version of every package).

| Option | Good | Bad |
|---|---|---|
| Two repos: `simple-invoice-api` + `simple-invoice-web` | Each part has its own history, CI (automatic build and test) and owner, which is how a bank usually splits backend and frontend teams. Clear boundary: the frontend can only use the public API. | The reviewer must clone two folders. The full-stack `docker-compose.yml` has to live in one of them and reach the other with a path outside its own repo. |
| Monorepo with workspace tooling (npm workspaces, Nx or Turborepo) | One clone. One place for shared tools and scripts. | It merges the lockfiles and changes how dependencies are installed, so the exact versions we tested would move. It adds setup the reviewer must understand. Frontend code can easily import backend code by accident. |
| **Plain monorepo: `backend/` + `frontend/` + `docs/` + compose at the root, no workspace tooling (chosen)** | One clone and one `docker compose up` from the root. Each app keeps its own `package.json` and lockfile, so installs work exactly as they were tested. The folders stay independent. | No shared tooling between the apps. Each npm command must run from inside its own folder. |

**Why:** The reviewers asked for one repository, and the brief allows a monorepo. The project first used two repos, because that gives a clean boundary and matches how a bank often splits teams. It changed because a reviewer had to clone two folders and put them side by side, and the compose file reached the other repo by a relative path (`../simple-invoice-web`, or `WEB_CONTEXT`). Now `docker compose up -d --build` works from one clone. We did not add workspace tooling: it would merge the lockfiles and change how dependencies install, while each app keeps the lockfile we already tested. The frontend still talks to the backend only over HTTP, and nothing imports across `backend/` and `frontend/`, so the security boundary is the same as with two repos.

### D-02 Spec first, then code

We wrote `SPEC.md` before any code. It records every assumption (A-1 to A-18), the database design, the API contract, and the security design.

**Why:** In banking, unclear rules become money bugs. Writing the rules down first let many coding helpers (AI subagents) work in parallel without guessing. It also gives the reviewer one place to check our thinking.

### D-03 Build with parallel AI agents, reviewed by the lead

The work was split into small tasks with strict file ownership (each task may only edit its own folders). The tasks ran in parallel. The lead engineer reviewed every result before accepting it: read the code, ran the tests, and compared the result with the spec.

**Why:** It is faster, and strict ownership stops agents from overwriting each other. Review by the lead is required, because an agent's own report is not proof.

---

## 2. Backend stack

### D-04 NestJS 11 (not NestJS 12)

The brief requires NestJS. The question was which major version (a big version number that can contain breaking changes).

| Option | Good | Bad |
|---|---|---|
| **NestJS 11.2.6 (chosen)** | Still receives security patches (last one 2026-09-23). Uses CommonJS (the classic Node module system), which works well with Jest and ts-jest. Very well known. | Not the newest line. |
| NestJS 12.1 | Newest. | Released one month ago (2026-08-27). All packages are ESM-only (the newer module system), which causes known problems with Jest and CommonJS projects. Higher risk for a short delivery window. |

**Why:** In a bank, "patched and proven" beats "newest". Moving to 12 later is a planned upgrade, not an emergency.

### D-05 Node.js 24 LTS

LTS means "long-term support": the version gets security fixes for years.

| Option | Good | Bad |
|---|---|---|
| **Node 24 (chosen)** | Active LTS, supported until 2028-04. Required by the newest test tools (jsdom 30, Vitest 5). | None for this project. |
| Node 22 | Still supported (maintenance until 2027-04). | Our local Node 22.21 was too old for jsdom 30 and Vitest 5. |
| Node 26 | Newest. | Not LTS until 2026-10-28, so not yet a production choice. |

### D-06 TypeScript 5.9.3 (not TypeScript 7)

| Option | Good | Bad |
|---|---|---|
| **5.9.3 (chosen)** | Works with every tool we use. | None. |
| 7.0 (current npm "latest") | Much faster compiler. | `@nestjs/swagger` and `ts-jest` do not support it yet, so builds and tests break. |

**Why:** A tool must work with the whole chain, not only on its own. All versions are pinned exactly (no `^`), so a fresh install tomorrow gives the same result as today.

### D-07 Validation: class-validator for requests, zod for environment settings

| Place | Choice | Why |
|---|---|---|
| HTTP request bodies and query strings | class-validator + class-transformer | The brief requires them. They also plug into NestJS and Swagger (the API documentation page), so one DTO (Data Transfer Object: a class that describes the shape of a request) gives both validation and docs. |
| Environment variables at startup | zod | Settings are checked once, before the app starts. If anything is wrong, the app refuses to start (called "fail fast"). zod gives short, typed schemas for this. Error messages show the setting name, never its value, so secrets never leak into logs. |

Requests are strict: unknown fields are rejected (`forbidNonWhitelisted`). A client cannot sneak in fields like `status` or `createdBy`. This attack is called "mass assignment".

### D-08 Logging: pino (via nestjs-pino)

| Option | Good | Bad |
|---|---|---|
| **pino (chosen)** | Structured JSON logs (easy to search in tools like ELK or Datadog). Very fast. Built-in redaction (hiding values) for passwords, tokens, cookies and the Authorization header. Every log line carries a request id. | JSON is harder to read by eye (we use pretty output in development). |
| NestJS default logger | Zero setup. | Plain text, no redaction. |
| winston | Popular, flexible. | Slower. Redaction must be built by hand. |

**Why:** Leaking a token or password into logs is a common real incident. Redaction is built in and tested.

### D-09 Own UUIDv7 function instead of the `uuid` package

A UUID is a random-looking unique id. Version 7 starts with a timestamp, so new rows are stored in time order. That keeps the database index compact and fast.

| Option | Good | Bad |
|---|---|---|
| **Small own function following RFC 9562 (chosen), with tests** | No extra dependency. Works in our CommonJS build. | We own about 30 lines of code. |
| `uuid` package v14 | Well known. | ESM-only now, so it breaks our CommonJS build. |
| Auto-increment numbers (1, 2, 3...) | Simple. | Ids are guessable. An attacker can try `/invoices/1`, `/invoices/2`... (OWASP API1, "broken object level authorization"). It also leaks how many invoices exist. |

---

## 3. Database and money

### D-10 PostgreSQL (not MongoDB)

| Option | Good | Bad |
|---|---|---|
| **PostgreSQL (chosen)** | ACID transactions (all-or-nothing changes that stay correct even with many users at once). Exact `NUMERIC` type for money. CHECK constraints (rules the database itself enforces). Row locks. The standard choice in core banking. The brief also recommends it. | Schema changes need migrations (versioned SQL files). We see this as a benefit. |
| MongoDB | Flexible documents, fast to start. | No exact decimal math by default in JavaScript drivers. Rules such as "total = subtotal + tax - discount" cannot be enforced across fields as simply. Invoices are strongly structured data, so a fixed schema fits them better. |

### D-11 PostgreSQL 17 (not 18)

| Option | Good | Bad |
|---|---|---|
| **17 (chosen)** | Stable, supported until 2029-11. Standard Docker volume path. | Not the newest. |
| 18 | Newest, supported until 2030-11. | The official Docker image changed where data is stored. A small compose mistake can silently lose data on restart. Not worth the risk for a demo that must "just work". |

### D-12 ORM: Drizzle ORM (not Prisma, not TypeORM)

An ORM is a library that lets code work with the database using functions instead of hand-written SQL.

| What we need | Drizzle 0.45 | Prisma 7 | TypeORM 1.x |
|---|---|---|---|
| CHECK constraints in the schema file | Yes, written in code and exported to SQL migrations | No, SQL must be edited by hand | Partly (decorator), and migrations are TS classes, not SQL |
| Case-insensitive unique invoice number (`lower(invoice_number)`) | Yes | No, hand-written SQL only | No, raw SQL only |
| Fast text search index (pg_trgm GIN, a special index for "contains" search) | Yes | Yes | Raw SQL |
| Exact money values | Returns `NUMERIC` as a string (exact) | Decimal objects (good) | Needs a custom converter |
| Row lock `SELECT ... FOR UPDATE` | Built in | Only with raw SQL | Built in |
| Code generation step | None | Required (`prisma generate`) in build and Docker | None |
| Plain SQL migration files a DBA can review | Yes | Yes | No (TypeScript classes) |
| Risk right now | Low (pinned stable 0.45.3) | npm "latest" is a release candidate (8.0 rc), big changes in 7 | Moved to 1.x this year |

**Why:** A bank's DBA (database administrator) wants to read the exact SQL that will run. With Drizzle every rule lives in the schema file and in reviewed SQL migrations. Nothing is hidden or hand-patched.

### D-13 Money: exact decimals everywhere, sent as strings

| Option | Good | Bad |
|---|---|---|
| **`NUMERIC(19,4)` in DB + decimal.js in code + strings in JSON (chosen)** | Exact. `0.1 + 0.2` is `0.3`, not `0.30000000000000004`. Works for any currency, including ones with 0 or 3 decimals. JSON strings cannot lose precision in any client language. | JSON shows `"2180.00"` instead of `2180`. This is a documented change from the brief's example. |
| JavaScript `number` (floating point) | Simple. | Cannot store most decimal values exactly. Rounding errors add up. Not acceptable for money. |
| Integer minor units (cents) | Exact and fast. | Rates like `0.3333` (more decimals than the currency) do not fit. Every currency needs its own scale logic in every layer. |

Rules:

- Rounding is HALF_UP (0.5 always goes up, the rule most tax offices use), to the currency's official number of decimals from ISO 4217 (the world standard list of currencies): AUD 2, JPY 0, VND 0.
- The server always calculates the totals. The browser never does. A user cannot send a fake total.
- The database checks the formula again with CHECK constraints: `total = subTotal + tax - discount`, `balance = total - paid`, `paid <= total`. If the code ever has a bug, the database refuses the bad row. This is "defense in depth" (several layers of protection, so one failure is not enough to cause damage).

### D-14 "Overdue" is calculated, never stored

| Option | Good | Bad |
|---|---|---|
| **Calculate it when reading: `status != Paid AND dueDate < today` (chosen)** | Always correct. No nightly job needed. Follows the brief exactly. | The same rule must be used in code and in SQL filters (we test both). |
| Store "Overdue" and update it with a nightly job | Simple queries. | Wrong between job runs. If the job fails, the data is wrong. The brief says it must be derived. |

"Today" comes from an injected Clock (a small service that says what time it is, which tests can replace) in a configured business time zone (`BUSINESS_TIMEZONE`). This mirrors the "business date" concept in core banking. It also makes tests repeatable: a test can say "today is 2026-10-01" and check the result.

### D-15 Customer details stored on the invoice (snapshot)

| Option | Good | Bad |
|---|---|---|
| **Copy customer fields onto the invoice (chosen)** | An invoice is a legal document. If a customer changes address next year, old invoices must still show the old address. | Some repeated data. |
| Separate `customers` table with a link | No repeated data. | Changing a customer silently changes past invoices, unless you add versioning (much more work). |

### D-16 Case-insensitive unique invoice numbers

`INV-001` and `inv-001` are treated as the same number. A unique index on `lower(invoice_number)` enforces this.

**Why:** Look-alike invoice numbers are a known cause of payments being matched to the wrong invoice. The database index also handles the race where two people save the same number at the same moment: one wins, the other gets `409 Conflict`. A "check first, then insert" approach in code cannot prevent that race.

### D-17 Offset pagination (page numbers)

| Option | Good | Bad |
|---|---|---|
| **Offset (`page`, `pageSize`) (chosen)** | Required by the API contract in the brief. Easy to jump to page 5. | Slower on very deep pages. Rows can shift between pages while new invoices arrive. |
| Keyset (cursor, "give me rows after this one") | Fast at any depth. Stable. | Cannot jump to a page number. Not what the brief asks for. |

We added a stable tie-breaker (sort by the chosen column, then by `id`), so rows with equal values never appear twice or go missing. Keyset is listed in the README as the choice for large scale.

---

## 4. Security

### D-18 Login token design: short JWT in memory + refresh token in a secure cookie

A JWT is a signed token that proves who you are. A refresh token is a long-lived secret used only to get a new JWT.

| Option | Good | Bad |
|---|---|---|
| **JWT (1 hour, as the brief requires) kept only in browser memory + random refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie (chosen)** | JavaScript cannot read the cookie, so an XSS attack (injected script) cannot steal the long-lived secret. The short token is lost on page reload and silently restored through the cookie. | Some extra code (refresh flow). |
| JWT in `localStorage` | Very simple. | Any injected script can steal it and use it for its whole life. OWASP advises against this. |
| Classic server session cookie only | Very safe. | The brief requires `POST /auth/login` to return a JWT. |
| Full BFF (Backend-for-Frontend, a server that holds tokens so the browser never sees them) | Strongest option. | More moving parts than the brief needs. Listed as a future step. |

Extra protections on the refresh token:

- **Stored hashed.** Only a SHA-256 hash (a one-way fingerprint) is stored in the database. A database leak does not give usable tokens.
- **Rotation.** Every refresh gives a new token and kills the old one.
- **Reuse detection.** If an old token is used again, someone has stolen it. We kill the whole "family" (all tokens from that login), which logs out both the thief and the user. This is the approach in the OAuth 2.0 security best practice (RFC 9700).
- **Absolute lifetime.** A login can live at most 7 days, even with constant refreshing.

### D-19 Instant logout: session check on every request

A normal JWT stays valid until it expires, even after logout. We put a session id (`sid`) inside the JWT and check it against the database on every request (one fast indexed lookup).

| Option | Good | Bad |
|---|---|---|
| **JWT + session check (chosen)** | Logout and token theft detection take effect immediately, not up to 1 hour later. | One small database query per request. |
| Pure stateless JWT | No query. | A stolen token works for up to 1 hour after logout. Hard to accept in banking. |

### D-20 JWT signing: HS256 with strict checks

| Option | Good | Bad |
|---|---|---|
| **HS256 (shared secret), at least 256 bits, algorithm pinned, `iss`/`aud`/`exp` checked (chosen)** | Simple, secure for one service. Pinning blocks the known "alg: none" and algorithm-confusion attacks (RFC 8725). | The same secret signs and verifies. Fine while only this API checks tokens. |
| RS256 / EdDSA (public/private key pair) | Other services can verify without the secret. Supports key rotation. | More setup than one service needs. Listed as the next step if more services are added. |

The token contains no personal data (no email), only ids and the role.

### D-21 CSRF protection for the cookie endpoints

CSRF (Cross-Site Request Forgery) is when a bad website makes your browser send a request to our site with your cookie.

Only `/auth/refresh` and `/auth/logout` use the cookie. They require all of these:

1. `SameSite=Strict` cookie (the browser does not send it from other sites).
2. A custom header `X-Requested-With: SimpleInvoice`. Other websites cannot add custom headers without our permission (CORS).
3. `Origin` and `Sec-Fetch-Site` headers must say "same site".

| Option | Good | Bad |
|---|---|---|
| **Layered checks above (chosen)** | No extra state to store. OWASP says SameSite alone is not enough, so we add header checks. | None for this design. |
| Classic CSRF token (hidden random value) | Well known. | Needs storage and an extra round trip. Not needed when the cookie is only used on two JSON endpoints. |

### D-22 Password storage and login hardening

| Topic | Choice | Other options and why not |
|---|---|---|
| Hash algorithm | bcrypt, cost 12 (the brief requires bcrypt) via **bcryptjs** | `bcrypt` (native C++ build): needs compilers inside the Alpine Docker image and breaks more often on install. `argon2`: stronger modern choice, but the brief asks for bcrypt. |
| Long passwords | Reject over 72 bytes | bcrypt silently ignores everything after byte 72, so two different passwords could match. Rejecting is honest. |
| Wrong email vs wrong password | Same message `Invalid email or password`, and the same timing (we run a dummy bcrypt check for unknown emails) | Different messages or timing let attackers find out which emails exist ("user enumeration"). |
| Guessing attacks | Rate limit per IP (10 logins per minute) + per-account slowdown after 5 failures (30 s, then 60 s, 120 s... up to 15 min) | Permanent lockout: an attacker could lock real users out on purpose (denial of service). CAPTCHA: needs a third-party service. Our approach follows OWASP and NIST SP 800-63B. |

### D-23 Roles and permissions (RBAC)

RBAC means "role-based access control".

- `ACCOUNTANT` can read and create invoices.
- `AUDITOR` can only read.
- Every route is protected by default ("deny by default"). A route is open only when it is marked `@Public()`.

| Option | Good | Bad |
|---|---|---|
| **Permissions checked per route (`invoice:create`), mapped from roles (chosen)** | Shows both 401 (who are you?) and 403 (you are not allowed). Easy to add roles later. | Small extra code. |
| Only "logged in or not" | Simplest. | Cannot show authorization, which a bank reviewer will look for. |

### D-24 Idempotency-Key on invoice creation (exactly-once)

Idempotency means "doing the same request twice has the same effect as doing it once".

If the network drops after the user clicks "Save", the browser may retry. Without protection that creates two invoices. The browser sends a unique `Idempotency-Key` header. The server stores the key and the first response in the same database transaction as the invoice.

| Option | Good | Bad |
|---|---|---|
| **Key stored in PostgreSQL, inside the same transaction (chosen)** | Exactly once, even with two requests at the same moment (the database primary key makes the second one wait). A retry gets the same answer, with header `Idempotent-Replayed: true`. The same key with a different body gets `422`. | One extra table. |
| No protection | Simple. | Duplicate invoices on retries. |
| Redis (a separate in-memory data store) | Fast. | A second system, and it is not in the same transaction as the invoice, so crashes can still create duplicates. |

This follows the IETF Idempotency-Key draft and the way Stripe (a major payment company) does it. It is the same idea banks use to stop duplicate payments.

### D-25 Append-only audit log

Every login, failed login, lockout, refresh, token reuse, logout, invoice creation and access denial is written to `audit_events`.

- Database triggers block `UPDATE`, `DELETE` and `TRUNCATE` on this table, even in replication mode (`ENABLE ALWAYS`). So not even a bug in our code can change history.
- The invoice audit row is written in the same transaction as the invoice. Both are saved, or neither.
- It stores a hash of the email for failed logins, never the raw unknown email or any password.

A future step (in the README) is a separate database user for the app that has only INSERT and SELECT rights on this table.

### D-26 Rate limiting in memory (@nestjs/throttler)

| Option | Good | Bad |
|---|---|---|
| **In-memory throttler (chosen)** | No extra service. Enough for one API instance. | Limits are per instance. With several instances you need a shared store. |
| Redis-backed limiter | Works across many instances. | An extra service for a single-instance demo. Listed in limitations. |

The real client IP is used because nginx overwrites `X-Forwarded-For` and the API trusts exactly one proxy hop. A client cannot fake its IP to avoid the limit.

### D-27 Secrets: generated at first start, never committed

| Option | Good | Bad |
|---|---|---|
| **A one-time `secrets-init` container creates random DB password and JWT secret into a Docker volume. Apps read them through `*_FILE` variables (chosen)** | `docker compose up` works with zero manual steps, and no secret is ever in git. | Removing the volumes (`down -v`) creates new secrets, and data too. |
| Secrets written in `docker-compose.yml` or a committed `.env` | Simple. | Secrets in git is a top real-world leak cause. A bank reviewer will flag it at once. |
| Ask the user to create `.env` by hand | Safe. | Breaks the "one command" requirement. |

### D-28 One origin for browser traffic (nginx reverse proxy)

nginx (a web server) serves the React app and forwards `/api/*` to the API. A reverse proxy is a server that passes requests on to another server.

| Option | Good | Bad |
|---|---|---|
| **Same origin through nginx (chosen)** | No CORS needed (CORS: browser rules for calling other domains). The cookie is first-party, so `SameSite=Strict` works. Security headers and CSP (Content Security Policy: a browser rule that blocks injected scripts) are set in one place. | The backend routes are reached at `/api/...` from the browser. They are still exactly as in the brief on the API itself. |
| Browser calls the API on a different port or domain | No proxy needed. | Needs CORS with credentials. Cookies become third-party and many browsers block them. |

Also: containers run as non-root users, the database port is only open on `127.0.0.1` (your own machine), request bodies are limited to 16 kB, `pageSize` is capped at 100, and helmet sets standard HTTP security headers.

---

## 5. Frontend

### D-29 Vite + React 19 (not Next.js)

| Option | Good | Bad |
|---|---|---|
| **Vite 8 + React 19 SPA (chosen)** | The brief requires ReactJS. A Single Page App (SPA) is simple and fast to build. Static files are served by nginx. There is no Node server in production, so there is less to attack. | No server-side rendering (not needed behind a login). |
| Next.js | Server rendering, many features. | A second backend we do not need. Tokens and cookies get more complex. |
| Create React App | Once the default. | Deprecated (no longer maintained). |

### D-30 Architecture: Feature-Sliced Design (FSD)

FSD is a way to organise frontend folders by layer: `app`, `pages`, `features`, `entities`, `shared`. Code may only import from layers below it.

| Option | Good | Bad |
|---|---|---|
| **FSD v2.1, checked by the `steiger` linter (chosen)** | Clear place for every file. No circular imports. The linter (a tool that checks code rules automatically) enforces the rules, so they do not rely on memory. The client asked for this. | More folders for a small app. |
| Folder by type (`components/`, `hooks/`, `utils/`) | Familiar. | Grows into a mess. Nothing stops wrong imports. |

We use FSD v2.1 without the `widgets` layer, because the app is small ("keep code local until it is reused").

### D-31 Server data: TanStack Query

| Option | Good | Bad |
|---|---|---|
| **TanStack Query 5 (chosen)** | Caching, removal of duplicate requests, retries, cancelling old requests, and keeping the previous page visible while the next one loads. | One more library. |
| `useEffect` + `fetch` by hand | No library. | Race conditions (an old slow response overwrites a newer one), no cache, much repeated code. Vercel's React guidelines advise against it. |
| Redux Toolkit Query | Strong. | Brings Redux, which we do not need. |

### D-32 Routing: React Router 7 (not 8)

| Option | Good | Bad |
|---|---|---|
| **React Router 7.18 (chosen)** | Stable, widely known. Route loaders act as auth guards before a page renders. We import only from `react-router`, so moving to v8 later is easy. | Not the newest. |
| React Router 8 | Newest. | Released 2026-06 with API removals. Less proven. |
| TanStack Router | Very type-safe. | Less familiar to most reviewers. |

### D-33 Forms: react-hook-form + zod

| Option | Good | Bad |
|---|---|---|
| **react-hook-form 7 + zod 4 (chosen)** | Fast (few re-renders). The zod schema copies the server's rules, so users see errors before sending. The server still checks everything again. | Two libraries. |
| Formik | Known. | Slower and less actively maintained. |
| Hand-written validation | No library. | Easy to miss rules. |

Money fields are text inputs (`inputMode="decimal"`), not number inputs. Browser number inputs can turn `0.10` into `0.1` or use floating point. The values stay strings all the way to the server.

### D-34 UI: Tailwind CSS 4 + shadcn/ui

| Option | Good | Bad |
|---|---|---|
| **Tailwind + shadcn/ui on Radix (chosen)** | Accessible components (keyboard and screen reader support from Radix). Responsive layout is easy. We own the component code (it is copied in, not a black box), and the bundle is small. | Utility classes look busy in markup. |
| MUI / Ant Design | Many ready components. | Big bundles and heavy theming. Harder to meet a strict CSP. |

The font is bundled locally. There are no CDN calls, so the strict CSP stays strict.

### D-35 List filters in the URL

Search text, status, sort, dates and page number are kept in the URL (`?status=Overdue&page=2`).

| Option | Good | Bad |
|---|---|---|
| **URL as the single source of truth (chosen)** | Users can share links and bookmark filtered views. The back button works as expected. A page reload keeps the filters. | Must validate the URL values (bad values fall back to defaults). |
| React state only | Simple. | Filters are lost on reload. Links cannot be shared. |

### D-36 Access token only in memory

The token lives in a JavaScript variable, never in `localStorage` or `sessionStorage`. On page load the app asks `/auth/refresh` once to get a new one (see D-18). When many requests fail with 401 at the same time, only one refresh call is made ("single-flight"), and then those requests are retried once.

---

## 6. Testing and delivery

### D-37 Backend tests against a real PostgreSQL (Testcontainers)

Testcontainers is a library that starts a real database in Docker for each test file.

| Option | Good | Bad |
|---|---|---|
| **Real PostgreSQL 17 in Docker for e2e tests (chosen)** | Tests the real CHECK constraints, triggers, locks and unique indexes. These are exactly the security and money rules that matter. | Tests need Docker and take a few seconds longer. |
| Mocked database | Very fast. | Would not catch a broken constraint, lock or SQL query. |
| SQLite in memory | Fast. | Different SQL. No `FOR UPDATE`, no `NUMERIC` behaviour the same as Postgres. |

Pure business rules (money, totals, status) also have fast unit tests without any database.

### D-38 Frontend tests: Vitest + Testing Library + MSW

MSW (Mock Service Worker) fakes the API at the network level.

| Option | Good | Bad |
|---|---|---|
| **Vitest 5 + Testing Library + MSW 2 (chosen)** | Vitest shares Vite's config, so tests run the same code as the build. Testing Library tests what the user sees, not internal details. MSW fakes the real API contract, so components run unchanged. | None important. |
| Jest | Well known. | Needs extra setup for Vite and ESM. |
| MSW 3 | Newest. | Released 2 days before this project. Too new. |

### D-39 Docker images

- **API:** multi-stage build (build in one image, copy only the result into a small `node:24-alpine` image). Runs as a non-root user. On start it runs migrations, then the optional seed, then the app. It has a health check.
- **Web:** built by Vite, served by unprivileged nginx on port 8080. SPA fallback, cache headers, CSP and a body size limit.

**Why:** Small images have fewer packages that could have security holes. Non-root containers limit the damage if something is broken into.

### D-40 Exact version pinning

Every dependency is pinned to an exact version, and the lockfile is committed.

**Why:** Several npm "latest" tags today are breaking or too new (TypeScript 7, msw 3, React Router 8, Prisma 8 rc). Pinning means the reviewer installs exactly what we tested.

---

## 7. Decisions made during the build

These came up while the agents wrote the code. The lead reviewed each one.

### D-41 Reusing an expired Idempotency-Key

A key is kept for 24 hours. After that the same user may use it again.

| Option | Good | Bad |
|---|---|---|
| **One statement: `INSERT ... ON CONFLICT DO UPDATE ... WHERE expires_at < now` (chosen)** | Atomic (it happens as one step or not at all). Two requests can never both take the same old key. | Slightly harder to read. |
| Delete the old key, then insert (the first SPEC idea) | Easy to read. | Two steps, so two requests at the same moment can race (both think they won). |

**Why:** the chosen way is safer, and the database does the locking for us. This is a small change from the SPEC.

### D-42 Check the business rules before the transaction starts

The server checks the invoice (dates, amounts, discount not bigger than subtotal) before it opens the database transaction and stores the key.

**Why:** if the check fails, no key is stored. The user can fix the form and send again with the same key, without a `422`.

### D-43 Search and sorting in SQL

- Search uses `ILIKE` (case-insensitive match) with the user text as a bound parameter (a value sent separately from the SQL text, so it can never change the query). The characters `%`, `_` and `\` are escaped (marked as normal letters), so a search for `50%` finds "50%" and not everything.
- Sorting only accepts three known column names (a whitelist). The invoice `id` is always added as a second sort key (a tie-breaker), so rows with the same date never jump between pages.

| Option | Good | Bad |
|---|---|---|
| **Bound parameter + escaping + whitelist (chosen)** | No SQL injection (an attack where user text becomes part of the query). Stable pages. | A few lines of extra code. |
| Put the user text into the SQL string | Short. | SQL injection. Never acceptable in banking. |
| Full-text search engine (for example Elasticsearch) | Very powerful search. | A whole new system for two text columns. |

### D-44 Demo data (seed)

The seed creates 2 users, the example invoice from the brief, and 40 more invoices.

| Option | Good | Bad |
|---|---|---|
| **Fixed random seed + fixed counts per status (chosen)** | Same data on every machine. Every status (including Overdue) always has at least 4 invoices. | About 10 lines for our own small random generator. |
| `Math.random` | No code. | Different data every run. A status could be missing. |
| A fake-data library (for example faker) | Nice names. | A new dependency (package), not needed. |

- Running the seed twice is safe: ids and invoice numbers never change, and existing rows are skipped (`ON CONFLICT DO NOTHING`). Everything is in one transaction.
- Dates are relative to the business date (today in `BUSINESS_TIMEZONE`), so Overdue invoices exist whenever you seed a new database.
- The example invoice totals are compared with the brief's numbers (2000.00, 200.00, 20.00, 2180.00). If they differ, the seed stops with an error.

### D-45 Seed passwords

- `SEED_DEMO_PASSWORD` is required (15 to 72 bytes). There is no default in the code.
- An existing user keeps their password. Set `SEED_RESET_PASSWORDS=true` to reset the demo passwords and remove any lock.
- If the seed fails, it prints only the database's own short message. The ORM (Drizzle) message also lists the query values, and that would include the password hash (the scrambled form of the password).

**Why:** no secret in code or in logs, and a re-run never silently changes a password someone set.

### D-46 Idempotency-Key in the browser: one key per exact request

| Option | Good | Bad |
|---|---|---|
| **New key when the request body changes, same key for the same body (chosen)** | A retry after a network error sends the same key, so no duplicate. If the user edits the form, it is a new request with a new key, so no `422`. | A few lines to remember the last body. |
| One key per form (the first version) | Simple. | If the first try failed and the user changed a field, the server answers `422` (same key, different body). |
| New key on every click | Simple. | A retry after a timeout could create a second invoice. |

The database unique index on the invoice number is a second safety net: the same invoice number can never be saved twice.

### D-47 Money fields in the form are text fields

The rate, tax and discount inputs are `<input type="text" inputMode="decimal">`. The phone still shows a number keypad.

| Option | Good | Bad |
|---|---|---|
| **Text + `inputMode` (chosen)** | The value stays exactly what the user typed, as a string. No floating point (the inexact number type in JavaScript). | We validate the format ourselves (a few small rules on the string). |
| `type="number"` | Browser checks. | Gives a JS number, can change `0.10` to `0.1` and accepts `1e3`. Breaks our money rule. |

The form never shows a calculated total. Only the server calculates money (D-13).

### D-48 How server errors are shown in the create form

- `409` for a duplicate invoice number: the error appears under the "Invoice number" field and the cursor moves there.
- `403`: a message "You do not have permission to create invoices".
- Everything else (`400`, `422`, `429`, `500`, no network): a message box at the top, read out by screen readers (`role="alert"`).

**Why:** the duplicate number is the one error the user must fix in one exact field. The other messages are free text, so matching them to fields would be fragile (easy to break). A message box stays on screen; a toast (a small popup) disappears.

### D-49 "Back to invoices" link keeps your filters

The list page sends its own address (with filters, sort and page) to the detail page in the router state. The back link uses it. It only accepts addresses that start with `/invoices`, so it can never send the user to another site (an open redirect, a known attack). With no state (for example, you opened the link in a new tab) it goes to `/invoices`.

| Option | Good | Bad |
|---|---|---|
| **Router state from the list (chosen)** | Exact list view comes back. Safe. | The list must pass the state (it does). |
| Browser "back" (`navigate(-1)`, the first version) | No code in the list. | After a login redirect, "back" can leave the app. The lead found this in review. |
| Save the last list address in `sessionStorage` | Works after reload. | Browser storage, which we avoid for anything session-related. |

### D-50 Invoice list behaviour

- **Search box:** waits 300 ms after the last key before it searches (debounce), so typing "anderson" sends 1 request, not 8.
- **Bad values in the address bar** (for example `page=abc`): each value falls back to its default on its own, so one bad value does not remove the good ones. The page never shows an error for an old bookmark.
- **"From" date after "to" date:** the page shows an error next to the dates and sends no request.
- **Phone vs desktop:** a table on desktop, cards on a phone. Only one of them is in the page at a time.
- **While the next page loads:** the old rows stay on screen, a little faded, so nothing jumps.
- **Empty list:** three different messages (no match for your filters, no invoices yet, page number too high), each with a useful button.

### D-51 Login form rules

- The error text is always the same: "Invalid email or password". It never tells an attacker whether the email exists.
- The password is never trimmed (spaces removed), because that would change what the user typed.
- The maximum is 72 bytes, not 72 characters, because bcrypt (the password hash) only reads the first 72 bytes. Letters with accents use more than one byte.
- After login, the page only redirects to a safe address inside the app (`//evil.com` and full URLs are refused).

### D-52 Login attempt is counted before the password check

The server writes "one more failed attempt" in the database first, inside a row lock, and only then runs the slow bcrypt check. A success resets the counter.

| Option | Good | Bad |
|---|---|---|
| **Count first, then check (chosen)** | 50 parallel guesses cannot all pass the "fewer than 5 failures" check at the same moment (a race condition, when two things happen at once and both win). | One extra write on every login. |
| Check first, count after a failure | Simpler. | During the slow bcrypt check, many parallel guesses all see the old counter, so the lockout can be skipped. |

**Why:** in banking, a lockout that can be skipped with parallel requests is not a lockout.

### D-53 Role and session are read from the database on every request

The JWT (access token) carries only the user id and the session id (`sid`). The role comes from the database in the same query that checks the session (D-19).

**Why:** if an admin changes a user's role, the change works on the next request, not after the token expires. The query is one indexed lookup, so the cost is small.

### D-54 A session has a hard end date

Each login starts a token "family" (all refresh tokens from that login). The family has an absolute lifetime. When a refresh token is rotated (replaced by a new one), the new token never lives longer than its family. The cookie `Max-Age` (how long the browser keeps it) is set to the time that is really left.

| Option | Good | Bad |
|---|---|---|
| **Absolute family end date (chosen)** | A stolen but active session still ends. Matches bank practice (log in again after a fixed time). | The user must log in again after the limit, even if active. |
| Sliding lifetime only (each refresh adds more time) | The user is never logged out while active. | A stolen session can live forever if the attacker keeps refreshing. |

### D-55 Docker Compose hardening details

| Choice | Why | Other option we did not pick |
|---|---|---|
| Secrets made from `/dev/urandom` (the Linux secure random source) with `od` | Already inside the small `alpine` image, nothing to install. | `openssl rand`: same quality, but needs an extra package. |
| Each secret file has its own owner and mode (read rights): the DB password can be read by postgres and the API, the JWT secret only by the API | One container that is broken into cannot read secrets it does not need (least privilege). | One shared readable folder: simpler, but every container sees every secret. |
| Files are written to a temp name, then moved (atomic move) | A crash never leaves a half-written secret. | Write in place. |
| Ports bound to `127.0.0.1` only; the database has no host port by default (opt-in file `docker/compose.db-port.yml`) | Nothing is open to the local network. The database is reachable only by the API. | Publish every port on all interfaces (the Docker default). |
| `cap_drop: ALL` (remove all Linux special rights), read-only API file system | If the app is attacked, the attacker can do very little inside the container. | Docker defaults. |
| Demo password has a default (`SimpleInvoice-Demo-2026`, can be changed with `SEED_DEMO_PASSWORD`) | The brief (2.3.3) asks for a seeded user with credentials written in the README. It is a public demo value, not a secret. | Random password printed in logs: safer, but the reviewer must search the logs to log in. |

### D-56 Two browser tabs refreshing at the same time

Each tab keeps its access token in its own memory, but all tabs share one refresh cookie. If two tabs refresh at the same moment, both send the same refresh token. The server sees the second one as reuse of an old token (a sign of theft) and ends the session (D-19, D-54).

| Option | Good | Bad |
|---|---|---|
| **Web Locks API: `navigator.locks.request('simple-invoice:refresh', ...)` (chosen)** | Built into all modern browsers, no library. Tabs take turns: the second tab waits, then sends the new cookie that the first tab just got. The browser frees the lock if a tab closes. About 5 lines. | Very old browsers do not have it; they fall back to today's behaviour (protected inside one tab only). |
| BroadcastChannel "leader" tab that refreshes for all tabs | Only one tab ever calls refresh. | Much more code: choose a leader, pass the token between tabs, handle the leader tab closing. Passing tokens between tabs also spreads them further. |
| Server grace window (accept the old token for a few seconds after rotation) | Works in every browser. | Weakens theft detection: a stolen token also works during the window. Not a good trade for a banking client. |

**Why:** the safest option that is also the smallest. Server-side reuse detection stays strict.

### D-57 Where types and constants live

| App | Types | Constants |
|---|---|---|
| Backend | `<module>.types.ts` (for example `auth/auth.types.ts`) | `<module>.constants.ts` |
| Frontend | `model/types.ts` in each slice, `types.ts` in each `shared` segment | `model/constants.ts` in the slice, or `shared/config` when many layers need it |

Two exceptions, in both apps:

- A type made from a constant or a schema (for example `type InvoiceStatus = (typeof INVOICE_STATUSES)[number]`) stays next to that constant. They must always change together, so they sit together.
- React `Props` types stay in the component file (normal React style; only that component uses them).

| Option | Good | Bad |
|---|---|---|
| **Separate types and constants files (chosen)** | Easy to find. No magic numbers or repeated header names (a typo in one copy would be a silent bug). Values that the client and server must share (field limits, header names) have one home per app. | More small files. |
| Types and values next to the code that uses them | Fewer files. | The same value gets copied into several files and drifts apart (this happened before the cleanup: two copies of the SHA-256 helper and of the date check). |

A related choice: the API sets the insert lock wait with `set_config('lock_timeout', $1, true)` instead of `SET LOCAL lock_timeout = '5s'`. Both do the same thing for the current transaction, but only the first takes the value as a bound parameter, so the constant is never pasted into SQL text.

### D-58 The API uses its own small database user

| Choice | Why | Other option we did not pick |
|---|---|---|
| Two database users. The owner (who created the tables) is used only by a short job that runs the migrations and then stops. The API uses `simple_invoice_app`, a user that is not a superuser (a user with every right), owns nothing and can only read and add rows (plus change rows in three tables that need it). | If someone breaks into the API, they cannot turn off the audit trigger (a rule that runs on every change), cannot change or delete audit rows, and cannot remove the money checks. In PostgreSQL only the owner can do those things. This is least privilege (give only the rights that are needed). | One user for everything: simpler, but a bug or attack in the API gets full control of the database. |
| A separate one-shot `migrate` service. The API waits until it has finished successfully (`service_completed_successfully`). | The owner password never enters the API container, not even as a file. If a migration fails, the API does not start with a half-changed schema. | Run migrations inside the API container at start: the API would need the owner password. |
| Two secret volumes, and the migrate job runs as a different Linux user (uid 1001). | Each container can read only the files it needs: the API cannot read the owner password, the migrate job cannot read the JWT key. | One volume with all secrets: every container could read every secret. |
| The script sends a SCRAM verifier (a salted, one-way form of the password that PostgreSQL can check but not reverse), not the password. The role name goes in as a bound parameter and is quoted by the server. | The plain password never appears in database logs, and no SQL is built from strings. | `ALTER ROLE ... PASSWORD 'plain'`: the password could appear in the server log. |
| The script removes all rights first, then gives the exact list, every time it runs (idempotent: same result every time). | A right added by hand to "fix" something is taken away on the next start, so the real rights always match the code. | Grant once at first start: extra rights could stay forever without anyone seeing them. |
| The API port is not published. The only way in is nginx. There is an opt-in file `docker/compose.api-port.yml` for local debugging. | The API trusts one proxy for the `X-Forwarded-For` header (the header that says the client IP). nginx always overwrites it, but a direct caller can fake it and so avoid rate limits or put a false IP in the audit log. We tested this. | Publish the API port always: easier for tools like Postman, but the client IP can be faked. |
| The nginx frontend runs with a read-only file system, with small in-memory folders (`tmpfs`) only for `/tmp` and the generated nginx config. | An attacker cannot change the web files or the nginx config. | A writable file system (the Docker default). |

### D-59 One lock per login session for refresh and logout

The security review (T12, finding M1) found a race (two actions at the same moment that give a wrong result). Logout, and reuse detection (the server sees an old refresh token used again), must end every token of the login session (the "family"). This was one UPDATE statement. In PostgreSQL's default mode (READ COMMITTED: each statement only sees data that was committed when the statement started), that UPDATE could not see a new token that a refresh running at the same moment had created but not yet saved (committed). So the new token stayed active and the user was not really logged out. A test now reproduces this, and it failed on the old code.

Now every change to a family (refresh, logout, reuse revoke) first takes one PostgreSQL advisory lock (a lock on a number instead of on a table row) for that family, inside its transaction (a group of statements that succeed or fail together). The lock is held until the transaction ends, so changes of one session run one at a time: a logout waits for a running refresh, and a refresh waits for a running logout. After the lock, the UPDATE sees every new token.

| Option | Good | Bad |
|---|---|---|
| Keep one UPDATE | Simple. | It is the bug. |
| Lock every token row of the family, then update | Waits for a running refresh. | Can deadlock (two transactions wait for each other forever) with reuse detection, which already holds the old token row. |
| Lock only the active token rows, then update | Fixes the reported race, no deadlock. | A second refresh can still slip in between the lock and the update (a very small gap, but real with several API copies). |
| **One advisory lock per family, taken first by every change (chosen)** | Closes the gap completely. Cannot deadlock, because every transaction takes this one lock before any row lock. Sessions of different users never wait for each other. | Each refresh sends two extra small statements (a read by token hash on a unique index, and the lock call). |
| A new `sessions` table with one row per family to lock | Same effect as the advisory lock. | Needs a schema change (migration) and more code. |

The lock uses the two-key form `pg_advisory_xact_lock(1, hashtext(family_id))`. The first key (1) is reserved for refresh families in `auth.constants.ts`, so a future advisory lock with another first key can never clash with it. If two family ids have the same hash, those two sessions only wait for each other a little; the result is still correct. A logout that finds nothing left to revoke writes no LOGOUT audit event, because the earlier logout or reuse detection already recorded the end of that session.

### D-60 Smaller fixes from the security review

| Finding | What we changed | Why, and what we did not pick |
|---|---|---|
| M2: rate limit skipped for other spellings of the path | The login and refresh limits now follow the handler (the controller method), not the URL text. The two handlers carry a small decorator (a label on a method), and the throttler reads it with Nest's `Reflector` (a helper that reads such labels). | Express (the web server under Nest) ignores upper or lower case and a final slash, so `/AUTH/LOGIN` reached the login handler but skipped the limit of 10 per minute. Turning on "strict routing" would only hide the problem; the handler check cannot be bypassed by any spelling. |
| L2: customer data in error logs | Unexpected database errors are logged in a reduced form: error name, SQLSTATE code (the 5 character PostgreSQL error code), constraint, table, the first line of the driver message, and the stack frames. | Drizzle puts the full SQL and every bound value into the error, so a failed insert wrote customer names, emails and addresses into the logs. Logs are kept longer and read by more people than the database, so this breaks data minimisation (keeping only the data you need). We fixed it in the exception filter, the one place that logs unhandled errors, where it is easy to unit test. |
| I1: example secret accepted in production | With `NODE_ENV=production` the API refuses to start if the JWT secret or the DB password is the public example value from `.env.example`. The error names the setting, never the value. | Anyone could sign tokens with a secret copied from a public file. We compare against a short list of known example values; we did not try to measure entropy (how random a string is), because such a test is easy to get wrong. |
| I5: authorization allowed by default | `PermissionsGuard` now fails closed (when unsure, deny). A route that is not public must list its permissions or carry `@AuthenticatedOnly()` (any signed-in user). Otherwise it answers 403 and writes `ACCESS_DENIED`. Only `GET /auth/me` needed the new label. | Before, a developer who forgot `@RequirePermissions` on a new route would have opened it to every role, including AUDITOR. |
| I7: no query time limit | Every connection in the API pool has `statement_timeout` 15 s. | PostgreSQL itself stops a longer statement and frees the connection, so one slow query cannot block others. We did not use pg's `query_timeout`: it is only a timer in Node.js, and the query keeps running in the database. |
| L3: Swagger on the same origin as the app | Kept on, documented in SPEC section 14. | The reviewers need to try the API. A real deployment turns it off (`SWAGGER_ENABLED=false`) or serves it on another origin. |

### D-61 Static analysis pass (SonarQube) and install scripts

We ran SonarQube (a tool that reads the code and reports bugs, risky code and style problems) on both apps and fixed most findings. Two changes affect the build:

| Change | Why, and what we did not pick |
|---|---|
| `npm ci --ignore-scripts` in both Dockerfiles | Install scripts (small programs a package runs while it is installed) are a common supply chain attack path (an attack through a dependency). No package in the images needs one: the only production package with a script, `@scarf/scarf`, only sends install statistics. esbuild, Rollup and Tailwind ship their native binaries as normal packages. |
| The frontend Dockerfile copies only the files the build needs, not `COPY . .` | A wide copy can put local files (for example an `.env`) into the image if `.dockerignore` misses them. A short list of files is easier to check. |

Findings we kept on purpose:

| Finding | Why we kept it |
|---|---|
| "Prefer top-level await" in the API start scripts | The API compiles to CommonJS (the classic Node.js module format), where top-level `await` is a syntax error. |
| "Prefer top-level await" in `list-search.ts` | False alarm: these are zod `.catch()` fallbacks, not promises. |
| "Remove the `void` operator" before `navigate(...)` | `void` is how the stricter rule `@typescript-eslint/no-floating-promises` marks a promise we do not wait for on purpose. |
| Unknown CSS rule `@custom-variant` | It is a valid Tailwind v4 rule that SonarQube does not know yet. |
| "Table without header" in `shared/ui/table.tsx` | This is a generic building block; the pages that use it add the header row. |
| `http://localhost` default origins | Local development defaults only; production sets `ALLOWED_ORIGINS`. |

For canonical JSON (the stable form of a request body that we hash for idempotency) we sort keys by code unit (the raw character code), not with `localeCompare`. `localeCompare` depends on the language settings of the machine, and the hash must be the same everywhere.

---

## Change log

| Date | Change |
|---|---|
| 2026-09-30 | First version, written together with SPEC v1.0. |
| 2026-09-30 | Added section 7 (D-41 to D-51): decisions from the build. Changed after lead review: browser Idempotency-Key is now per request body (D-46), back link uses router state instead of browser back (D-49), logout clears cached data only after leaving the protected page. |
| 2026-09-30 | Added D-52 to D-55: login attempt counted before the check, role read on every request, session hard end date, Docker Compose hardening details. |
| 2026-09-30 | Added D-56: Web Locks for refresh across browser tabs. |
| 2026-09-30 | Added D-57: where types and constants live (after the cleanup tasks T15 and T16). |
| 2026-09-30 | Added D-58 to D-60 after the security review (T12): least-privilege database user and migrate job, one lock per login session for refresh and logout, and the smaller fixes (rate limit by handler, reduced error logs, example secrets refused in production, authorization fails closed, query time limit). |
| 2026-09-30 | Added D-61: SonarQube pass, install scripts turned off in Docker builds, findings kept on purpose. |
| 2026-09-30 | Moved to one monorepo (D-01): backend/, frontend/, docs/ and compose at the root. |
