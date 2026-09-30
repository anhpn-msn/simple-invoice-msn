# SimpleInvoice monorepo

Take-home assessment for 101 Digital (core banking and digital wallet background; security is judged hardest).
One plain git repository holds both apps, the docs and the full-stack compose file. There are no npm workspaces, Nx or Turborepo: each app keeps its own `package.json` and `package-lock.json` and runs its own npm scripts from inside its folder.

- `backend/`: NestJS 11 API, PostgreSQL 17, Drizzle ORM (has its own `CLAUDE.md`)
- `frontend/`: React 19 + Vite SPA, Feature-Sliced Design (has its own `CLAUDE.md`)
- `docs/`: SPEC, ARCHITECTURE, DECISIONS, research and the client's brief
- `docker/` and `docker-compose.yml`: full-stack Docker Compose (run from the repository root)

The frontend talks to the backend only over HTTP. Nothing imports across `backend/` and `frontend/`.

## Source of truth

1. `docs/SPEC.md` is normative. Read the sections relevant to your task before writing code. If the spec and your instinct disagree, follow the spec; if the spec is wrong or silent, stop and report instead of improvising.
2. `docs/assessment.txt` is the text of the client's original brief (the PDF, `Assessment_Fullstack_v3.0.0.pdf`, is not in this repository).
3. `docs/research/*.md` holds the evidence behind decisions (stack versions, security, money, frontend rules).
4. `docs/DECISIONS.md` lists every library and design choice with the alternatives and the reason. Any new library or non-trivial design choice must be added there (or reported to the lead for adding): what was chosen, the options compared, and why. Write it in simple English (B1/B2); explain any harder or technical word in parentheses.

## Toolchain

- Node 24 LTS. Before any npm command run: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null`.
- Run npm commands from inside `backend/` or `frontend/`, never from the repository root (there is no root `package.json`).
- Pin exact versions from `docs/SPEC.md` section 3.4. Never install `latest` blindly (TypeScript 7, msw 3, react-router 8 break this stack).
- Do NOT add, remove, or upgrade dependencies unless your task brief says so. If you truly need one, stop and report it.
- Docker is available (Testcontainers for API e2e tests). Compose commands run from the repository root.

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

## Backend conventions (`backend/`)

- Module layout: SPEC section 3.2. Pure domain code in `src/invoices/domain` has no Nest imports.
- Global guards are deny-by-default; public routes must be marked `@Public()`.
- Every endpoint is fully decorated for Swagger (request DTO, query DTO, success and error responses).
- Schema changes only through Drizzle schema + generated SQL migrations (plus custom SQL migrations for triggers/extensions). Never edit an applied migration; add a new one.
- Unit tests: `*.spec.ts` next to the code. E2E: `test/*.e2e-spec.ts` with Testcontainers PostgreSQL.
- Scripts (run in `backend/`): `npm run build`, `npm test`, `npm run test:e2e`, `npm run db:generate`, `npm run db:migrate`, `npm run seed`, `npm run start:dev`.

## Frontend conventions (`frontend/`)

- Feature-Sliced Design v2.1 (Claude Code skill `feature-sliced-design`), layout in SPEC section 8.1. No `widgets/` layer. Import only downward; slice public API via `index.ts`; no `export *`.
- React rules: Claude Code skill `react-best-practices` (SPA-relevant subset listed in `docs/research/04-frontend-guidelines.md`).
- Path alias `@/` maps to `src/`. Server state via TanStack Query; filters in URL search params; forms via react-hook-form + zod.
- Access token only in memory (`shared/auth`). Never localStorage/sessionStorage.
- Tests: Vitest + Testing Library + MSW, `*.test.ts(x)` next to the code. Scripts (run in `frontend/`): `npm run dev`, `npm run build`, `npm test`, `npm run lint`, `npm run lint:fsd`.

## Git

- One repository. Conventional Commits, subject max 72 chars, imperative. No attribution trailers (no Co-Authored-By, no session links).
- Subagents do not commit; the lead session commits after review.
- `docs/superpowers/` is local-only and git-ignored.
