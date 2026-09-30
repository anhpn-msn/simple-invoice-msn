# SimpleInvoice: Architecture

Companion to `SPEC.md` (normative details). This document explains the shape of the system and the reasoning behind the security-relevant flows.

## 1. System context

```mermaid
flowchart LR
  U[Browser<br/>React SPA] -- "HTTPS, same origin<br/>/ and /api/*" --> N[nginx<br/>web container :8080]
  N -- "/api/* (prefix stripped)" --> A[NestJS API<br/>api container :3000]
  A -- "pg (pool), role simple_invoice_app" --> D[(PostgreSQL 17<br/>db container)]
  M[migrate<br/>one-shot, schema owner] -- "migrations, runtime role, seed" --> D
  S[secrets-init<br/>one-shot] -. "owner password" .-> M
  S -. "app password + JWT secret" .-> A
  S -.-> D
```

- The browser only ever talks to one origin. nginx serves the SPA and reverse-proxies `/api/*` to the API, so the refresh cookie is first-party and CORS stays disabled.
- The API is stateless apart from PostgreSQL. It exposes exactly the routes in the assessment (`/auth/*`, `/invoices*`) plus `/health` and Swagger at `/api/docs`.
- Secrets are generated on first start and never committed. They sit in two volumes, so the API never sees the owner password.
- Only nginx has a host port (`127.0.0.1:8080`). The API connects to PostgreSQL as `simple_invoice_app`, a least-privilege role that cannot disable the audit trigger or drop constraints; the one-shot `migrate` job is the only user of the owner account (SPEC 11.4).

## 2. Backend layers

```mermaid
flowchart TB
  subgraph HTTP
    MW[helmet, request-id, pino, 16 kB body limit]
    G[Guards: Throttler, JwtAuth deny-by-default, Permissions]
    P[ValidationPipe whitelist + forbidNonWhitelisted]
    F[AllExceptionsFilter uniform error shape]
  end
  C[Controllers<br/>auth, invoices, health] --> SV[Services<br/>AuthService, InvoicesService, IdempotencyService, AuditService]
  SV --> DOM[Domain, framework-free<br/>money, currency registry, calculator, status derivation]
  SV --> R[Repositories<br/>Drizzle query builders]
  R --> DB[(PostgreSQL<br/>CHECK constraints, unique indexes, append-only audit)]
  CLK[Clock + BusinessCalendar] --> SV
  HTTP --> C
```

Design rules:

- Money and status logic live in `src/invoices/domain`, pure TypeScript with `decimal.js`, unit tested without Nest or a database.
- The database re-states every invariant as a CHECK constraint (totals formula, balance, no overpayment, due date, Paid means settled). The application is the first line of defense; the schema is the last.
- "today" comes from an injected clock evaluated in `BUSINESS_TIMEZONE`, which is the application's equivalent of a core-banking business date. It is passed to SQL as a bound parameter, never `CURRENT_DATE`.

## 3. Data model

```mermaid
erDiagram
  users ||--o{ invoices : "created_by"
  users ||--o{ refresh_tokens : "owns"
  users ||--o{ idempotency_keys : "scopes"
  users ||--o{ audit_events : "actor"
  invoices ||--|{ invoice_items : "has 1..n (UI: 1)"
  refresh_tokens ||--o| refresh_tokens : "replaced_by"

  invoices {
    uuid id PK
    varchar invoice_number "unique on lower()"
    date invoice_date
    date due_date "CHECK >= invoice_date"
    char currency
    varchar status "Draft|Pending|Paid (Overdue derived)"
    numeric invoice_sub_total
    numeric total_tax
    numeric total_discount
    numeric total_amount "CHECK = sub + tax - discount"
    numeric total_paid "CHECK <= total_amount"
    numeric balance_amount "CHECK = total - paid"
    varchar customer_fullname "embedded snapshot"
  }
```

Customer data is embedded on the invoice as a snapshot, because an issued invoice is a legal document whose recipient details must not change retroactively.

## 4. Authentication flows

### 4.1 Login

```mermaid
sequenceDiagram
  participant B as SPA
  participant A as API
  participant D as DB
  B->>A: POST /auth/login {email, password}
  A->>A: throttle per IP, validate DTO (password <= 72 bytes)
  A->>D: find user by lower(email)
  alt unknown user
    A->>A: bcrypt.compare against dummy hash (equal timing)
  else locked (progressive back-off)
    A->>A: skip compare
  else
    A->>A: bcrypt.compare (cost 12)
  end
  A->>D: update failure counter or reset, audit LOGIN_*
  A->>D: insert refresh token (SHA-256 hash only), new family = session id
  A-->>B: 200 {accessToken (JWT, sid=family), expiresIn, user}<br/>Set-Cookie si_rt (HttpOnly, Secure, SameSite=Strict, Path=/api/auth)
  B->>B: keep access token in memory only
```

Every failure path returns the same `401 Invalid email or password`.

### 4.2 Authenticated request and immediate revocation

```mermaid
sequenceDiagram
  participant B as SPA
  participant A as API
  participant D as DB
  B->>A: GET /invoices (Authorization: Bearer JWT)
  A->>A: verify HS256 (pinned), iss, aud, exp
  A->>D: user exists AND session (sid) not revoked
  A->>A: PermissionsGuard: role grants invoice:read
  A-->>B: 200
```

The session check turns logout and refresh-token theft detection into immediate access-token revocation, instead of waiting up to the 3600 s token lifetime.

### 4.3 Refresh with rotation and reuse detection

```mermaid
sequenceDiagram
  participant B as SPA
  participant A as API
  participant D as DB
  B->>A: POST /auth/refresh (cookie si_rt, X-Requested-With, Origin)
  A->>A: CSRF checks (custom header, Origin, Sec-Fetch-Site)
  A->>D: BEGIN; find token by hash; lock its family (advisory lock); SELECT token FOR UPDATE
  alt token already rotated or revoked (replay)
    A->>D: revoke whole family; audit REFRESH_TOKEN_REUSE_DETECTED
    A-->>B: 401 (all sessions of that family die, incl. the attacker's)
  else valid and family not past absolute lifetime
    A->>D: insert successor (same family), mark old replaced; COMMIT
    A-->>B: 200 new access token + rotated cookie
  end
```

Refresh, logout and reuse revoke all take the same per-family advisory lock first, so they run one at a time for one session: a logout can never miss a successor token that a refresh is creating at the same moment (DECISIONS D-59).

## 5. Creating an invoice (exactly-once)

```mermaid
sequenceDiagram
  participant B as SPA
  participant A as API
  participant D as DB
  B->>A: POST /invoices (Idempotency-Key: uuid) body
  A->>A: validate DTO, calculate totals with decimal.js (HALF_UP to currency minor units)
  A->>D: BEGIN; set transaction-local lock_timeout
  A->>D: INSERT idempotency key ON CONFLICT DO NOTHING
  alt key exists, same request hash
    A-->>B: replay stored 201 (Idempotent-Replayed: true)
  else key exists, different hash
    A-->>B: 422
  else new key
    A->>D: INSERT invoice + item (CHECK constraints re-verify totals)
    A->>D: INSERT audit INVOICE_CREATED
    A->>D: store response on key; COMMIT
    A-->>B: 201 Location /invoices/{id}
  end
```

A duplicate invoice number (case-insensitive unique index) surfaces as `23505` inside the transaction and is mapped to `409`. There is no check-then-insert race.

## 6. Frontend

Feature-Sliced Design v2.1: `app > pages > features > entities > shared`, downward imports only, enforced by Steiger.

- `shared/auth` owns the in-memory session and a single-flight refresh, so ten parallel 401s cause one refresh call.
- `shared/api` attaches the bearer token, retries once after refresh, and normalizes errors into one `ApiError` type.
- List filters live in the URL (shareable, back-button safe). Server state is managed by TanStack Query.
- The UI never calculates totals and never converts money to floating point. Amounts arrive as decimal strings and are rendered with `Intl.NumberFormat`.
