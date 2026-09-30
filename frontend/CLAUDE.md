# SimpleInvoice Web

React 19 + Vite SPA for the 101 Digital SimpleInvoice assessment, organised with Feature-Sliced Design v2.1. The client has a core banking and digital wallet background; security is judged hardest. It lives in the `frontend/` folder of the SimpleInvoice monorepo. The API is in `../backend`, and the full-stack `docker-compose.yml` and the normative docs (`../docs/SPEC.md`, `../docs/DECISIONS.md`) are at the repository root. Run npm scripts from inside `frontend/`; there are no npm workspaces.

## Source of truth

`../docs/SPEC.md` is normative (section 8 for the frontend, 4.5 for validation rules, 6 for the API contract). If the spec is wrong or silent, stop and report instead of improvising. Record new libraries or non-trivial design choices in `../docs/DECISIONS.md`, in simple English (B1/B2).

## Toolchain

- Node 24 LTS: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null` before npm commands.
- Pin exact versions. Do not add, remove or upgrade dependencies without being asked (TypeScript 7, msw 3 and react-router 8 break this stack).

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

- Feature-Sliced Design v2.1, no `widgets/` layer: `app > pages > features > entities > shared`. Import only downward; each slice exposes a public API via `index.ts`; no `export *`. Checked by `npm run lint:fsd`.
- Path alias `@/` maps to `src/`.
- Types in `model/types.ts` (or `types.ts` in a `shared` segment), constants in `model/constants.ts` or `shared/config`. Types derived from a const or zod schema stay next to it; component `Props` stay in the component file (DECISIONS D-57).
- Server state via TanStack Query; list filters in URL search params; forms via react-hook-form + zod.
- Access token only in memory (`shared/auth`), never localStorage or sessionStorage. Refresh is single-flight in a tab and serialised across tabs with Web Locks.
- Tests: Vitest + Testing Library + MSW, `*.test.ts(x)` next to the code.

## Scripts

`npm run dev`, `npm run build`, `npm test`, `npm run lint`, `npm run lint:fsd`. A task is done only when all of them pass.

## Git

Conventional Commits, subject max 72 characters, imperative mood. No attribution trailers.
