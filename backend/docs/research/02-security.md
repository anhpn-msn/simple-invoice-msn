# 02 - Security research (auth, API hardening, audit, secrets)

Date: 2026-09-30. Scope: NestJS REST API + React SPA (Vite, nginx same-origin reverse proxy for /api) + PostgreSQL.
Sources are limited to IETF RFCs/drafts, OWASP (Cheat Sheets, ASVS 5.0, API Top 10 2023), NIST SP 800-63B-4, official NestJS/Express/PostgreSQL/Docker/library docs.
Marker "NO AUTHORITATIVE SOURCE" means the point is engineering judgement, not backed by a fetched standard. Marker "UNVERIFIED" means I relied on prior knowledge and did not fetch the page in this session.

Legend for verdicts: KEEP (planned design is fine), CHANGE (planned design should be corrected), ADD (missing control).

---

## A. Access token (JWT)

### A1. HS256 is acceptable (KEEP)
- RFC 8725 (JWT BCP) does not discourage HS256. The risk is weak keys: "human-memorizable passwords MUST NOT be directly used as the key to a keyed-MAC algorithm such as HS256" (RFC 8725 s3.5).
- Single service that both issues and verifies tokens means a shared secret is appropriate. EdDSA/RS256 only pays off when other services must verify without being able to mint tokens. Mention it in the README as the upgrade path, do not implement it.
- Sources: https://www.rfc-editor.org/rfc/rfc8725.html (s3.1, 3.2, 3.5, 3.8, 3.9)

### A2. Minimum key length (ADD startup validation)
- RFC 7518 s3.2: "A key of the same size as the hash output (for instance, 256 bits for HS256) or larger MUST be used." So minimum 256 bits = 32 random bytes.
- Recommendation: `JWT_SECRET` is base64 of 32 CSPRNG bytes (`openssl rand -base64 32`, or 48 bytes for margin). At startup: decode, fail fast (process exits) if decoded length < 32 bytes, if it equals a known placeholder ("changeme", ".env.example" value), or if it is missing. Do not validate by character count of a passphrase; validate decoded bytes.
- Source: https://www.rfc-editor.org/rfc/rfc7518.html#section-3.2

### A3. Verification: pin algorithm, validate claims (KEEP)
- Pin `algorithms: ['HS256']` at verify time (RFC 8725 s3.1; ASVS 5.0 V9.1.2 allowlist of algorithms, L1). Never derive the algorithm from the token header. Reject `none`.
- ASVS 5.0 V9.1.1 (L1) signature/MAC validated before trusting content; V9.2.1 (L1) exp/nbf enforced; V9.2.2 (L2) token type/purpose checked; V9.2.3 (L2) aud checked; V9.2.4 (L2) issuers using shared keys must include audience restriction. So iss + aud validation is a requirement, not decoration, for HMAC tokens.
- Recommended values: `iss = "invoice-api"`, `aud = "invoice-api"` (constants, from config), clockTolerance <= 5 s. Add a `typ`/purpose claim or use `at+jwt` header typ so refresh/other tokens can never be replayed as access tokens (refresh tokens are opaque, so this is naturally satisfied).
- Sources: https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x18-V9-Self-contained-Tokens.md ; https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html (JWT section: verify iss, aud, exp, nbf; denylist for early termination)

### A4. Claims and jti (KEEP, with one ADD)
- Minimal claims: `sub` (user UUID), `role`, `iat`, `exp`, `iss`, `aud`, `jti`. No email, no PII, no permissions lists.
- ADD `sid` (session/refresh-family id). Rationale: with the required default TTL of 3600 s, logout and refresh-reuse revocation would otherwise not affect a stolen access token for up to an hour. The JWT guard does one indexed PK lookup (`session.revoked_at IS NULL` and user active) per request, so revocation is immediate. This is the "denylist when sessions terminate early" idea of the REST cheat sheet, implemented as an allow-check. jti alone is only useful if you also keep a denylist or want it in audit logs; use it for audit correlation.
- NO AUTHORITATIVE SOURCE for the exact `sid` design; it is a standard engineering pattern that satisfies the REST cheat sheet's revocation advice.

### A5. TTL (CHANGE the framing, not the default)
- Assessment mandates env-configurable expiry with default 3600 s: keep `JWT_EXPIRES_IN_SECONDS=3600` as the coded default so the requirement is met literally.
- Because we also have a rotating refresh token and the `sid` check, document that a production profile would use 300-900 s. Set `.env.example`/compose to 900 only if you are sure graders do not test for 3600; safer: default 3600 in code and in `.env.example`, README notes the recommendation. (Judgement; NO AUTHORITATIVE SOURCE for a specific number. RFC 9700 s2.2.1 only says to sender-constrain / keep tokens short-lived.)
- Validate the env var: integer, 60 <= value <= 86400.

---

## B. Client storage, refresh, CSRF

### B1. Is memory + HttpOnly refresh cookie the recommended pattern? (KEEP, with an honest caveat)
- RFC 10017 (OAuth 2.0 for Browser-Based Applications, BCP 212, August 2026; the former draft-ietf-oauth-browser-based-apps) lists three architectures in decreasing security:
  1. BFF (s6.1): tokens never reach the browser; only an HttpOnly cookie session. "Strongly recommended for business applications, sensitive applications, and applications that handle personal data."
  2. Token-mediating backend (s6.2): backend holds refresh token (cookie), hands access token to the SPA.
  3. Browser-based client (s6.3): everything in the browser.
- Our plan (access token in memory, refresh token in HttpOnly cookie) is architecture 2. It is defensible and is the only one compatible with the assessment text ("POST /auth/login returns a JWT", Bearer-guarded /invoices). A pure BFF / cookie session is the stronger pattern for a wallet-grade app; state this trade-off explicitly in the README ("we chose 6.2 because the spec requires a JWT-returning login; in production we would move to 6.1 or add DPoP").
- Caveat to document: HttpOnly stops theft of the refresh token, not use. Any XSS in the SPA can call `POST /auth/refresh` (the browser attaches the cookie) and obtain an access token. Mitigations: strict CSP (D), no `dangerouslySetInnerHTML`, short access TTL, `sid` check, audit log of refreshes.
- In-memory storage is per RFC 10017 s8.4 better than localStorage (s8.5, universally accessible to script). After page reload the SPA silently calls `/auth/refresh` to bootstrap.
- Sources: https://www.rfc-editor.org/rfc/rfc10017.html (s6.1, 6.2, 6.3.2.3, 8) ; https://www.rfc-editor.org/rfc/rfc9700.html (s2.2.2, 4.14)

### B2. Refresh token rotation and reuse detection (KEEP)
- RFC 9700 s2.2.2: "Refresh tokens for public clients MUST be sender-constrained or use refresh token rotation" (s4.14). RFC 10017 s6.3.2.3: rotation or sender-constraint, bounded lifetime, lifetime linked to the user's authenticated session.
- Design: opaque token = 32 CSPRNG bytes, base64url (256-bit; OWASP session guidance minimum is 64 bits of entropy, Session Management cheat sheet). Not a JWT.
- Store only SHA-256(token) (a fast hash is fine for 256-bit random secrets; bcrypt is unnecessary). Columns: `id, family_id (= sid), user_id, token_hash UNIQUE, issued_at, expires_at, used_at, revoked_at, replaced_by, ip, user_agent`.
- On refresh: look up by hash; if not found or expired then 401; if `used_at` is set (already rotated) then reuse detected: revoke the entire family (`revoked_at` on all rows with the family_id), write audit event `REFRESH_REUSE_DETECTED`, return 401. Otherwise mark used, issue new token in the same family, all inside one transaction with `SELECT ... FOR UPDATE` on the row to avoid double-spend races.
- Practical addition: a short grace window (about 10 s) where re-presenting the just-rotated token returns 401 without revoking the family, to tolerate two tabs racing. NO AUTHORITATIVE SOURCE (RFC 9700 does not define a grace window; some vendors document one). If you skip it, use a BroadcastChannel/single-flight refresh in the SPA to avoid the race.
- TTLs: refresh idle/absolute: 7 days absolute per family (no sliding beyond family creation + 7 d), rotation on every use. Logout revokes the family. Password change (future) revokes all families. (Numbers are judgement; RFC 10017 only requires a maximum lifetime.)
- RFC 9700 s4.14 reuse text is drawn from the code-reuse rule in s4.2.4 ("SHOULD revoke all tokens issued previously"); the family-revocation mechanic itself is the standard implementation, the RFC leaves it to the AS.

### B3. Cookie attributes (CHANGE: narrow Path conflicts with __Host-)
- `__Host-` prefix (RFC 6265bis s4.1.3.2) requires Secure, no Domain, and Path exactly "/". It forbids a narrower Path.
- Options:
  1. `__Host-refresh`, Path=/. Strongest against subdomain/cookie-tossing; cookie is sent on every request (including /api/invoices), harmless but larger surface.
  2. `__Secure-refresh`, Secure, HttpOnly, SameSite=Strict, Path=/api/auth (narrow), no Domain. Recommended for us: cookie is only sent to /api/auth/*, and the app is host-only on a single origin.
- Recommendation: option 2. Note the Path must match the browser-visible URL path (nginx `/api/auth`), not the backend's internal path if nginx rewrites/strips the `/api` prefix.
- RFC 10017 s6.1.3.2 (BFF cookies): Secure, HttpOnly, SameSite=Strict, no Domain, prefer `__Host-Http-`-style prefixes. (rfc6265bis is at draft-22, "In Final Review" with the RFC Editor as of Dec 2025, so cite it as a draft.)
- Max-Age = refresh TTL (persistent cookie so reload/restart works). On logout: overwrite with `Max-Age=0` using identical Path/attributes.
- Local dev over plain http: `Secure` cookies are accepted on http://localhost by Chrome/Firefox but not necessarily Safari. Make `COOKIE_SECURE` env-driven (default true) and test the compose demo in the browser the graders will use. NO AUTHORITATIVE SOURCE fetched for the localhost exception (UNVERIFIED).
- Response headers for /auth/*: `Cache-Control: no-store` (REST cheat sheet; Session Management cheat sheet).
- Sources: https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/ ; https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html (Secure, HttpOnly, SameSite=Strict preferred, __Host- for session IDs, Path scoping caveat)

### B4. CSRF for /auth/refresh and /auth/logout (ADD: SameSite alone is not enough)
- OWASP CSRF cheat sheet: "SameSite is useful as a defense-in-depth control but it does not replace a proper CSRF defense in most deployments." Origin/Referer verification must not stand alone; combine with another mitigation. Custom request headers are effective for AJAX endpoints because they force a CORS preflight. Fetch Metadata `Sec-Fetch-Site` is a simple, well-supported signal (about 98% coverage) with Origin fallback. Login CSRF also needs protection.
- RFC 10017 s6.1.3.3 lists the same options for BFF: SameSite=Strict (insufficient if other apps share the site), a required custom request header (triggers preflight), or anti-forgery cookies.
- Concrete controls (apply to POST /auth/login, /auth/refresh, /auth/logout; all state-changing routes):
  1. Require a custom header, e.g. `X-Requested-With: fetch` (any fixed non-safelisted name), else 403. Since we do not enable CORS in production, a cross-origin page cannot send it.
  2. Origin check: if `Origin` is present it must equal the configured public origin(s) (`APP_ORIGIN` env); if `Sec-Fetch-Site` is present it must be `same-origin`. Missing Origin is tolerated only when the custom header is present (OWASP notes 1-2% of traffic omits Origin).
  3. Require `Content-Type: application/json` (reject form-encoded bodies so a plain HTML form cannot post).
  4. SameSite=Strict on the refresh cookie (already planned).
  5. No CORS headers at all in production (same-origin). In dev, allowlist only the Vite origin.
- Bearer-authenticated /invoices endpoints are not CSRF-able because the browser does not auto-attach the Authorization header; no CSRF token needed there.
- Sources: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html ; https://www.rfc-editor.org/rfc/rfc10017.html s6.1.3.3

---

## C. Login hardening

### C1. Generic errors and constant-ish timing (KEEP)
- OWASP Authentication cheat sheet: identical response for wrong user / wrong password / disabled account ("Login failed; Invalid user ID or password"); avoid early-exit code paths that differ in timing.
- Implementation: on unknown/disabled user still run `bcrypt.compare(password, DUMMY_HASH)` where DUMMY_HASH is generated once at startup with the SAME cost factor as real hashes (a mismatched cost defeats the purpose). Same status (401), same body, same headers. Do not return different codes for "locked".
- The bcrypt library's compare is not constant time but that is not exploitable because of preimage resistance (node.bcrypt.js README); the timing leak that matters is user existence (skipping the hash), which the dummy compare fixes.
- Sources: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html ; https://github.com/kelektiv/node.bcrypt.js

### C2. bcrypt cost and 72-byte limit (KEEP, values fixed)
- OWASP Password Storage cheat sheet: bcrypt work factor "as large as verification server performance will allow, with a minimum of 10." Argon2id (m=19456 KiB, t=2, p=1) is the first-choice algorithm generally, but the assessment mandates bcrypt, so use bcrypt.
- Recommendation: cost 12 (`BCRYPT_COST` env, validated 10..14, default 12). node.bcrypt.js benchmark on a 2 GHz core: cost 10 about 10 hashes/s, cost 12 about 2-3/s, cost 13 about 1/s. Cost 12 means roughly 250-400 ms per verify; that is why rate limiting must run BEFORE hashing (unauthenticated CPU DoS vector). Use the native `bcrypt` package (async, off the event loop thread pool), not bcryptjs sync.
- 72-byte limit: bcrypt only uses the first 72 BYTES (not characters; multibyte UTF-8 hits it sooner) and silently truncates (node.bcrypt.js README). OWASP: enforce it as a maximum or pre-hash with HMAC (`bcrypt(base64(hmac-sha384(pepper, password)))`) which also avoids NUL-byte truncation.
- Recommendation for this project: no registration endpoint exists (seeded user), so: (a) seed-time policy check on the demo password: min 15 chars (NIST 800-63B-4 s3.1.1.2 for single-factor, 8 only with MFA), max 72 BYTES via `Buffer.byteLength`; (b) login DTO: `@IsString @MaxLength(128)` (cheap DoS cap; longer than 72 bytes cannot match anyway); (c) document that pre-hash with HMAC is the alternative if longer passphrases are needed (NIST says verifiers SHOULD permit at least 64 characters, so 72 bytes covers 64 ASCII chars but not 64 arbitrary Unicode chars; note that as a known limitation, or pre-hash).
- NIST also asks for Unicode normalization before hashing (NFC/NFKC, apply consistently at seed and login) and a blocklist check of common/breached passwords; for a seeded demo password just choose a strong, non-dictionary value.
- Sources: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html ; https://pages.nist.gov/800-63-4/sp800-63b.html (s3.1.1.2)

### C3. Rate limiting, lockout vs throttling (CHANGE: use progressive per-account throttling, not hard lockout)
- OWASP Authentication cheat sheet: lockout after a threshold (example 5), counters tied to the ACCOUNT not the IP, exponential lock durations (1 s, 2 s, 4 s ...), but lockout is itself a DoS vector, so prefer throttling / progressive delay / CAPTCHA.
- NIST 800-63B-4 s3.2.2: limit consecutive failed attempts on a single account to no more than 100 (upper ceiling), allowing progressive delays (e.g. 30 s up to 1 hour), bot-detection, or risk signals. The old "lock after 5 permanently" is not required; 100 is the ceiling, so soft lockouts are compliant.
- Recommended values (judgement within those bounds):
  - Per IP (Nest `@nestjs/throttler`, in-memory is fine for one instance): `/auth/login` 10 requests / 60 s / IP; `/auth/refresh` 30 / 60 s; global default 100 / 60 s. Throttler v5+ TTL is in milliseconds; use the `seconds()`/`minutes()` helpers. For >1 instance you need a shared store (Redis storage or implement `ThrottlerStorage` on Postgres).
  - Per account (Postgres columns or table `login_attempts`, keyed by normalized email, and also kept for emails that do not exist so the counter cannot be used to enumerate): after 5 consecutive failures start a delay lockout of 30 s, doubling per further failure, capped at 15 min; reset on success. While locked return the SAME 401 generic response (still run the dummy compare) so lockout state does not reveal existence. Audit `ACCOUNT_LOCKED`.
  - Per-IP 429 responses are fine (not account-specific) and should include `Retry-After`.
  - Outer layer: nginx `limit_req` on `/api/auth/` (official nginx docs, ngx_http_limit_req_module, UNVERIFIED in this session) so bcrypt-bound requests are shed before Node.
- Behind nginx: Express `trust proxy` must be set narrowly (e.g. `1` hop, or the compose network subnet), and nginx must OVERWRITE, not append, `X-Forwarded-For` (`proxy_set_header X-Forwarded-For $remote_addr;`), otherwise clients spoof the throttle key (Express "Behind proxies" guide warns of exactly this; NestJS rate limiting docs tell you to set trust proxy and override the tracker).
- Sources: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html ; https://pages.nist.gov/800-63-4/sp800-63b.html ; https://docs.nestjs.com/security/rate-limiting ; https://expressjs.com/en/guide/behind-proxies.html

### C4. Email normalization (ADD)
- Normalize on both seed and login: trim, Unicode NFKC, lowercase (`toLowerCase()`); enforce with a unique index on `lower(email)` or a `citext` column so DB and app agree. Do not do provider-specific tricks (gmail dots, plus tags).
- NO AUTHORITATIVE SOURCE fetched for this exact rule (RFC 5321 treats the local part as case-sensitive in theory; the practice is universal). It matters for lockout counters and uniqueness, so state the decision in the README.

### C5. Other login points
- Login DTO validates shape only (string, email format, length caps); never enforce password composition at login.
- Log failures internally with a reason code (`UNKNOWN_USER`, `BAD_PASSWORD`, `LOCKED`, `DISABLED`), never in the response.
- Issue a new refresh family on every successful login (session fixation resistance, per Session Management cheat sheet: renew IDs on authentication).

---

## D. NestJS / nginx API hardening

### D1. Security headers: helmet vs built-in (CHECK your Nest version)
- The current NestJS docs (v12.1) say `app.useSecurityHeaders()` is built in, works on Express and Fastify, removes `X-Powered-By` by default, and sets CSP, HSTS (365 d), X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff; call it right after `NestFactory.create()`. For Nest <= 11 use `helmet` (`app.use(helmet())`). Use whichever matches the installed `@nestjs/core`. Also `app.getHttpAdapter().getInstance().disable('x-powered-by')` on Express as belt and braces (OWASP HTTP Headers cheat sheet: remove Server and X-Powered-By).
- Source: https://docs.nestjs.com/security/helmet ; https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html

### D2. CORS
- Production is same-origin through nginx: enable NO CORS. Dev only: `enableCors({ origin: [env allowlist], credentials: true, methods: [...], allowedHeaders: ['Authorization','Content-Type','X-Requested-With'], maxAge: 600 })`. Never `origin: true`/`*` with credentials. (OWASP REST cheat sheet lists CORS as a control; specifics are standard practice.)

### D3. Request size and validation
- Body limit: set an explicit small JSON limit (e.g. 16 kb; Nest: `app.useBodyParser('json', { limit: '16kb' })`, UNVERIFIED API name for your Nest version) and `client_max_body_size 16k;` in nginx. Return 413 (REST cheat sheet).
- `ValidationPipe`: `{ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: false }`; keep `disableErrorMessages` false (messages describe fields, not internals) but use a custom `exceptionFactory` to emit a stable shape. Nest docs describe whitelist (strip), forbidNonWhitelisted (throw), transform, disableErrorMessages. This is also the OWASP Mass Assignment cheat sheet's DTO allow-list approach.
- `ParseUUIDPipe` on every `:id` param so malformed ids get 400 before touching the DB. Cap array/string lengths in DTOs (`@MaxLength`, `@ArrayMaxSize`). Money: use integer minor units or a decimal string with a regex, never floats.
- Sources: https://docs.nestjs.com/techniques/validation ; https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html

### D4. Error handling, 404 vs 403, request IDs
- Global exception filter: known `HttpException` returns its status with a stable body; anything else (including TypeORM/pg errors such as unique violation text, constraint names) returns generic 500 `{ statusCode, error: "Internal Server Error", requestId }`. Log full detail server-side only. OWASP Error Handling cheat sheet: generic response to clients, details logged server-side, global handler, no stack traces; it suggests RFC 7807 problem details (note RFC 7807 is obsoleted by RFC 9457, UNVERIFIED in this session; either is fine, be consistent). `NODE_ENV=production` and no `stack` field ever.
- 401 for missing/invalid token, 403 for authenticated-but-not-allowed role (BFLA), 404 for a resource that does not exist OR belongs to someone else (REST cheat sheet: 404 avoids leaking existence). Implement by scoping the query itself (`WHERE id = :id AND owner_id = :sub`), never fetch-then-check.
- Request ID: nginx generates `$request_id` and sets `X-Request-Id`; Nest middleware accepts it only if it matches `^[0-9a-f]{32}$` or a UUID, else generates one; echo in response header; attach to every log line and audit row (Logging cheat sheet: "interaction identifier"). Never trust a client-supplied value unvalidated (log injection).
- Sources: https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html ; https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html ; https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

### D5. Log redaction
- Prefer not logging bodies or headers at all (allow-list what you log): method, route template, status, latency, requestId, userId, IP. If using pino/nestjs-pino: `redact: { paths: ['req.headers.authorization','req.headers.cookie','res.headers["set-cookie"]','req.body.password','req.body.refreshToken','*.password','*.token','*.accessToken'], censor: '[Redacted]' }` (pino redaction docs: paths are case-sensitive, wildcards cost more, hyphenated keys need bracket notation).
- OWASP Logging cheat sheet says never log passwords, session IDs, access tokens, encryption keys/secrets, connection strings.
- Sources: https://github.com/pinojs/pino/blob/main/docs/redaction.md ; https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

### D6. nginx headers and CSP for the SPA
- OWASP HTTP Headers cheat sheet values: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), camera=(), microphone=()`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-site` (same-origin is also fine for us), `X-Frame-Options: DENY`, `X-XSS-Protection: 0` (or omit), `Cache-Control: no-store` for API/auth responses, HSTS `max-age=63072000; includeSubDomains` ONLY when actually served over HTTPS (never on the plain-http localhost demo; it would poison the browser). Remove Server/X-Powered-By (`server_tokens off`).
- CSP for a Vite-built SPA with no inline scripts, based on the OWASP CSP cheat sheet strict baseline:
  `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
  - The cheat sheet baseline uses `default-src 'none'` and adds each needed type explicitly; either is fine, 'none' plus explicit list is stricter. If a UI library injects inline `style=` attributes, prefer `style-src-attr 'unsafe-inline'` over loosening `style-src`; test in the browser. Never `unsafe-eval` / `unsafe-inline` for scripts.
  - The SPA CSP must be served by nginx on the HTML/static location; do not also add a different CSP on proxied /api responses (the API sets its own via helmet; use `proxy_hide_header` only if they conflict).
  - nginx gotcha (UNVERIFIED here, from nginx docs): `add_header` in a `location` block discards inherited `add_header` from the server block; repeat the set (use an include file) and add `always` so headers appear on error responses.
- Swagger UI: NestJS docs say the `@nestjs/swagger` UI loads scripts/styles from the app itself so it works with the default policy under the built-in security headers/helmet; custom `customJs` hosts need `scriptSrc` entries, and `upgrade-insecure-requests` breaks plain-http (set `upgradeInsecureRequests: null` for the http demo). If your helmet version blocks it, relax CSP only on the docs path, not globally. Keep Swagger enabled for graders but behind an env flag (`SWAGGER_ENABLED`) so production can turn it off (OWASP API9 inventory: docs exposure is a conscious decision). Do not include the seeded password in the OpenAPI examples.
- Sources: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html ; https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html ; https://docs.nestjs.com/security/helmet

---

## E. OWASP API Security Top 10 (2023) mapped to one concrete control each

Source for the list: https://api-security.owasp.org/editions/2023/en/0x11-t10

| ID | Risk | Concrete control in this app |
|---|---|---|
| API1 | Broken Object Level Authorization | Every invoice query is scoped by owner in SQL (`WHERE id=:id AND owner_id=:sub`); foreign or missing returns the same 404; `ParseUUIDPipe` on ids; UUIDv4 keys (not enumerable) as defense in depth; an e2e test with two users proving cross-access returns 404. |
| API2 | Broken Authentication | HS256 pinned + iss/aud/exp; bcrypt cost 12; dummy-hash compare; per-IP throttle plus per-account progressive delay; rotating refresh with family revocation; `sid` check per request; generic error messages. |
| API3 | Broken Object Property Level Authorization | Response DTOs with explicit serialization (`@Exclude`/`ClassSerializerInterceptor` with `excludeExtraneousValues`) so `password_hash`, `owner_id`, internal flags never leak; request DTOs with `whitelist + forbidNonWhitelisted` so clients cannot set `id`, `ownerId`, `status` (mass assignment). |
| API4 | Unrestricted Resource Consumption | List endpoints: `pageSize` default 20, hard max 100 (`@Max(100)`), `page`/`offset` bounded, sort field allow-list; JSON body limit 16 kb; nginx `client_max_body_size`; throttler; bcrypt cost fixed so login is rate-limited before hashing; DB `statement_timeout`; pg pool max. |
| API5 | Broken Function Level Authorization | Roles guard (default deny: global JWT guard + `@Public()` opt-out only for login/refresh/health; `@Roles()` for privileged routes); a test that a non-admin gets 403 on admin-only routes and that every route not marked public returns 401 without a token (route-inventory test). |
| API6 | Unrestricted Access to Sensitive Business Flows | Login, refresh and invoice creation are the sensitive flows: dedicated tighter throttle on login and on invoice creation per user; audit events on state transitions (for example paying/voiding an invoice). Idempotency key on invoice creation if payments semantics exist (judgement). |
| API7 | Server Side Request Forgery | The API makes no user-controlled outbound requests: document that; no URL-fetching fields in DTOs; if a webhook/logo URL field is ever added, allow-list schemes/hosts and block private ranges. |
| API8 | Security Misconfiguration | helmet/built-in headers, no CORS in prod, no stack traces, `x-powered-by` off, `NODE_ENV=production`, secrets validated at startup (fail fast), DB runtime role with least privilege, `.env` not committed, containers non-root with read-only rootfs where possible, Postgres port not published to host. |
| API9 | Improper Inventory Management | Single versioned prefix (`/api/v1`), OpenAPI generated from code (no hand-maintained drift), Swagger behind a flag, no undocumented/debug routes, dependency audit (`npm audit`) noted in README; only ports 80/443 exposed by compose. |
| API10 | Unsafe Consumption of APIs | No third-party API consumed; document. Database is the only upstream: parameterized queries only (ORM/query builder, never string concatenation), validate data read back where it crosses trust boundaries. |

Source for each risk's prevention text: the individual pages under https://api-security.owasp.org/editions/2023/en/ (0xa1 through 0xaa). Only the index page was fetched in this session; the control mapping is my own.

---

## F. Audit logging

### F1. Events to log (OWASP Logging cheat sheet: authentication successes/failures, authorization failures, validation failures, session management events, privileged/administrative actions, access to sensitive data)
Write to a Postgres table `audit_log` AND stdout (structured JSON):
- `LOGIN_SUCCESS`, `LOGIN_FAILURE` (with internal reason), `ACCOUNT_LOCKED`, `LOGOUT`, `TOKEN_REFRESH`, `REFRESH_REUSE_DETECTED` (high severity), `TOKEN_REJECTED` (bad signature/expired/aud mismatch; count only, no token text), `AUTHZ_DENIED` (403, and 404s caused by ownership mismatch, flagged as such internally), `RATE_LIMITED`, `VALIDATION_FAILURE_BURST` (optional), `INVOICE_CREATED/UPDATED/DELETED/READ` (READ for detail view only, not list, to bound volume), `USER_SEEDED` at startup.
- Columns: `id bigint identity, occurred_at timestamptz default now(), event_type text, outcome text, actor_user_id uuid null, resource_type text, resource_id text, request_id text, ip inet, user_agent text (truncated to 256), details jsonb (allow-listed keys only)`. No FK with cascade delete from users (audit rows must outlive users); no PII beyond what is needed.
- Business-state audit rows are written in the same DB transaction as the change; authentication failure rows are written outside the request transaction so a rollback cannot erase them.
- Failed logins for unknown emails: store a SHA-256 (or truncated hash) of the normalized identifier, not the raw text, because users sometimes type passwords into the username box. (Judgement; NO AUTHORITATIVE SOURCE.)

### F2. Never log
Passwords (including failed attempts), access tokens, refresh tokens or their hashes, session IDs/cookies, Authorization header, encryption keys and secrets, connection strings, full request bodies (OWASP Logging cheat sheet lists passwords, session IDs, access tokens, keys/secrets, connection strings, payment/bank data as "never log unless legally sanctioned").

### F3. Append-only in PostgreSQL
- Triggers can skip or reject a row operation (CREATE TRIGGER docs); TRUNCATE triggers must be FOR EACH STATEMENT. Cover UPDATE, DELETE and TRUNCATE:
  1. `BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_reject()` where the function does `RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'insufficient_privilege'` (raise rather than `RETURN NULL`, which silently skips and hides tampering).
  2. `BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_log_reject()`.
  3. Mark them `ALTER TABLE audit_log ENABLE ALWAYS TRIGGER ...` so `session_replication_role = replica` does not bypass them (ALTER TABLE docs).
- A trigger alone is not tamper-proof: the table owner or a superuser can `ALTER TABLE ... DISABLE TRIGGER` (ALTER TABLE docs: owner can for user triggers). Therefore also: run migrations with an owner role (`app_owner`) and the API with a separate runtime role (`app_rw`) that has `INSERT, SELECT` only on `audit_log` (`REVOKE UPDATE, DELETE, TRUNCATE ... FROM app_rw`), and `USAGE` on the sequence. Document that the runtime role cannot disable triggers because it does not own the table.
- Optional tamper evidence (OWASP: "build in tamper detection"): `prev_hash`/`row_hash` chain (`row_hash = sha256(prev_hash || canonical row)`) computed in the insert function; skip unless time allows, mention as next step. Also ship logs off-box in production.
- Sources: https://www.postgresql.org/docs/current/sql-createtrigger.html ; https://www.postgresql.org/docs/current/sql-altertable.html ; https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

---

## G. Secrets in docker compose without committing secrets

### G1. Is an init container that generates secrets into a volume, plus `*_FILE` env, reasonable? Yes (KEEP), with caveats
- Docker docs: Compose secrets are mounted as files under `/run/secrets/<name>`; environment variables are discouraged because they are visible to all processes and leak into logs/debug output. OWASP Secrets Management cheat sheet: prefer mounted files over env vars, automate generation, never bake into images, never commit; it explicitly describes a sidecar pattern for fetching secrets.
- The official `postgres` image already supports `POSTGRES_PASSWORD_FILE` (also `POSTGRES_USER_FILE`, `POSTGRES_DB_FILE`, `POSTGRES_INITDB_ARGS_FILE`), so the `_FILE` convention is a documented, precedented pattern.
- Design:
  1. `secrets-init` service (alpine + openssl): if `/secrets/jwt_secret` does not exist, write `openssl rand -base64 48`; same for `db_password` (use a URL-safe alphabet such as `openssl rand -hex 24` if it will be embedded in a URL); `chmod 0440`, `chown` to a shared gid or per-consumer uid. MUST be idempotent (never overwrite existing files, otherwise every `docker compose up` rotates secrets and breaks Postgres).
  2. Named volume `secrets` mounted RW only in the init container and `:ro` in consumers. Consumers use `depends_on: { secrets-init: { condition: service_completed_successfully } }`.
  3. Postgres: `POSTGRES_PASSWORD_FILE=/run/secrets-vol/db_password`. Backend: a tiny config loader that resolves `X_FILE` before `X` (fail if both set), builds the DB connection from host/port/user/name plus the password file (Compose will not interpolate file contents into `DATABASE_URL`), and validates JWT secret length (A2).
  4. `.env.example` contains only non-secret settings; `.gitignore` covers `.env` and any `secrets/` dir; add a pre-commit/gitleaks note (OWASP Secrets cheat sheet: shift-left detection).
- Caveats to state in the README:
  - Volume lifecycle mismatch: Postgres reads `POSTGRES_PASSWORD_FILE` only when initializing an empty data directory. If someone runs `docker compose down -v` selectively (removes `secrets` but not `pgdata`), the new password will not match the DB. Keep both volumes removed together (single `down -v`) and document it.
  - Regenerating `JWT_SECRET` simply invalidates sessions (acceptable); regenerating the DB password does not.
  - Anyone with Docker socket access can read the volume; this is a demo-grade protection, not a vault. Not equivalent to Swarm/K8s secrets or Vault.
  - Seeded demo user: a random per-deploy password would be unusable by graders. Use a documented demo credential (README), seeded only when `SEED_DEMO_USER=true` (default true in the demo compose, false in a production profile), password meeting the policy in C2, and log a startup warning while it is active. Alternative: init container generates a random demo password and prints it once to its logs; more secure but worse reviewer UX. Choose the documented credential and label it clearly as demo-only.

### G2. Alternatives (ranked for this assessment)
1. Init container + volume + `_FILE` (recommended: zero manual steps, nothing committed).
2. Compose top-level `secrets:` with `file: ./secrets/xyz.txt` (gitignored) populated by `scripts/gen-secrets.sh` before `docker compose up`; standard Compose feature (mounted at `/run/secrets`), one extra manual step. Compose also supports `environment:`-sourced secrets.
3. `.env` generated by a script: simplest, but env-var exposure (Docker docs and OWASP both discourage).
4. Real secret managers (Vault, cloud KMS/Secrets Manager, SOPS-encrypted files, Docker Swarm secrets): the production answer; mention as the production path in the README.
- Sources: https://docs.docker.com/compose/how-tos/use-secrets/ ; https://hub.docker.com/_/postgres (Docker Secrets section) ; https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

---

## Summary of where the planned design should change

1. Cookie prefix vs narrow Path: `__Host-` forbids a narrow Path. Use `__Secure-` + Path=/api/auth (or `__Host-` + Path=/).
2. CSRF: SameSite=Strict alone is insufficient per OWASP. Add required custom header + Origin/Sec-Fetch-Site check + JSON-only content type; no CORS in production.
3. Add `sid` claim and a per-request session check so logout/reuse revocation is immediate despite the mandated 3600 s default TTL.
4. JWT secret: at least 32 random bytes (RFC 7518), validated on decoded bytes at startup; aud validation is mandatory for shared-key tokens (ASVS 9.2.4).
5. Lockout: use progressive per-account throttling (not permanent lockout), same generic 401 while locked, counters also for unknown emails; NIST ceiling is 100 consecutive failures.
6. bcrypt: cost 12, cap at 72 BYTES; dummy hash must use the same cost; rate-limit before hashing.
7. Proxy: `trust proxy` = 1 hop, nginx overwrites X-Forwarded-For; otherwise per-IP limits are spoofable.
8. Document honestly that our pattern is RFC 10017 s6.2 (token-mediating backend), not the BFF the RFC strongly recommends for sensitive apps, and that XSS can still call /auth/refresh.
9. Audit table: trigger for UPDATE/DELETE AND TRUNCATE, ENABLE ALWAYS, plus REVOKE on a separate runtime role (owner can disable triggers).
10. Secrets: init container must be idempotent; watch the pgdata/secrets volume mismatch; DATABASE_URL cannot embed a file, build it in app code.
11. Check Nest version: v12.1 has built-in `useSecurityHeaders()`; older versions use helmet.
12. HSTS only over real HTTPS; never on the http localhost demo.
