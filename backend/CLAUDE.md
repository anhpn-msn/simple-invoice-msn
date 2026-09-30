# SimpleInvoice API

NestJS 11 + PostgreSQL 17 + Drizzle backend for the 101 Digital SimpleInvoice assessment. The client has a core banking and digital wallet background; security is judged hardest. It lives in the `backend/` folder of the SimpleInvoice monorepo. The SPA is in `../frontend`, and the full-stack `docker-compose.yml` and the docs are at the repository root. Run npm scripts from inside `backend/`; there are no npm workspaces.

## Source of truth

1. `../docs/SPEC.md` is normative. Read the relevant sections before writing code. If the spec is wrong or silent, stop and report instead of improvising.
2. `../docs/assessment.txt` is the client's original brief.
3. `../docs/DECISIONS.md` lists every library and design choice with alternatives and reasons. Add an entry for any new library or non-trivial design choice, in simple English (B1/B2), explaining harder words in parentheses.
4. `../docs/research/*.md` holds the evidence behind decisions.

## Toolchain

- Node 24 LTS: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null` before npm commands.
- Pin exact versions (SPEC section 3.4). Do not add, remove or upgrade dependencies without being asked.
- Docker is required for `npm run test:e2e` (Testcontainers) and `docker compose up` (run from the repository root).

## Non-negotiable rules (both apps)

- Money is never a JS `number`. Backend: `decimal.js` via the domain `money` helpers. Frontend: decimal strings, formatted with `Intl.NumberFormat` from the string, never `parseFloat` for arithmetic. The frontend never calculates invoice totals.
- No secrets, passwords, or tokens in code, tests fixtures committed as real values, or logs. Everything configurable comes from env (SPEC section 10).
- Never return ORM rows directly from controllers; map to response DTOs.
- Never build SQL with string concatenation. Use Drizzle builders or the `sql` tagged template with bound parameters. Escape `%`, `_`, `\` in LIKE keywords.
- Overdue is derived, never persisted. `today` always comes from the injected `Clock`/business-date provider, never `new Date()` or `CURRENT_DATE` in business logic.
- Error responses always use the shape `{ statusCode, message, error }`.
- TypeScript strict. No `any` unless unavoidable and justified.
- Comments explain why, not what. Public domain functions get a short JSDoc. No commented-out code.
- No em dash character anywhere (code, docs, commits). Use a comma, colon, parentheses, or a spaced hyphen.
- Tests are part of the task. A task is done only when its tests pass and `npm run build` (and `npm run lint` if configured) succeed.

## Conventions

- Module layout: SPEC section 3.2. Pure domain code in `src/invoices/domain` has no Nest imports.
- Types live in `<module>.types.ts`, values in `<module>.constants.ts`. A type derived from a const stays next to it (DECISIONS D-57).
- Header names come from `src/common/http/http-headers.constants.ts`; hashing uses `sha256Hex` from `src/common/crypto`.
- Global guards are deny-by-default; public routes are marked `@Public()`.
- Every endpoint is fully decorated for Swagger (request DTO, query DTO, success and error responses via `createApiErrors`).
- Schema changes only through the Drizzle schema plus generated SQL migrations (custom SQL migrations for triggers and extensions). Never edit an applied migration.
- Unit tests: `*.spec.ts` next to the code. E2E: `test/*.e2e-spec.ts` with Testcontainers PostgreSQL.

## Scripts

`npm run build`, `npm test`, `npm run test:e2e`, `npm run lint`, `npm run db:generate`, `npm run db:migrate`, `npm run seed`, `npm run start:dev`. A task is done only when build, lint, unit and e2e tests pass.

## Git

Conventional Commits, subject max 72 characters, imperative mood. No attribution trailers.
