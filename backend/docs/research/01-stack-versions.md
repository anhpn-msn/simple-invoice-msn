# 01 - Stack versions and ORM decision (researched 2026-09-30)

Method: versions are the `latest` dist-tag (unless stated) from the npm registry via `npm view`, run 2026-09-30. Release dates are npm publish times. Behaviour claims come from official docs (docs.nestjs.com, prisma.io/docs, orm.drizzle.team, reactrouter.com, ui.shadcn.com, hub.docker.com/_/postgres, postgresql.org, nodejs/Release schedule.json). Items marked UNVERIFIED were not executed here (no scaffold or build was run).

Headline surprises versus older knowledge:
- Node 24 is Active LTS. Node 22 is Maintenance. Node 26 goes LTS on 2026-10-28.
- NestJS 12 is `latest` and all @nestjs/* packages are ESM-only ("type": "module"). Nest 11 is the `legacy` tag and still patched (11.2.6, 2026-09-23).
- TypeScript 7.0.2 (native compiler) is `latest` on npm. Do NOT use it yet: @nestjs/swagger 12 peers `typescript ^5.5 || ^6`, ts-jest peers `<7`.
- Prisma: the npm `latest` tag of the `prisma` CLI is 8.0.0-rc.19 (a release candidate). `npm i prisma` installs an RC. `@prisma/client` latest is 7.10.0. Pin exact.
- Drizzle: `latest` is still 0.45.3 / drizzle-kit 0.31.11. 1.0 is `rc` (rc.4, 2026-06-27) and `beta`.
- TypeORM is now 1.x (1.0.0 on 2026-05-19, 1.1.1 on 2026-09-01). 0.3.31 is the `legacy` tag.
- react-router `latest` is 8.4.0 (v8 GA 2026-06-17); v7 line is 7.18.4. `react-router-dom` is dropped in v8.
- msw `latest` is 3.0.0 (published 2026-09-28, 2 days old); 2.15.0 is the last 2.x.
- vitest 5.0.2, vite 8.3.1, @vitejs/plugin-react 6.1.1, jest-dom 7.0.1, jsdom 30.1.1, lucide-react 1.x.

## 1. Node.js and Docker images

| Item | Value | Source |
|---|---|---|
| Active LTS | Node 24 "Krypton" (24.21.0, 2025-10-28 LTS start, Maintenance 2026-10-20, EOL 2028-04-30) | https://github.com/nodejs/Release/blob/main/schedule.json , https://nodejs.org/dist/index.json |
| Maintenance LTS | Node 22 "Jod" (22.23.3), EOL 2027-04-30 | same |
| Current (not LTS yet) | Node 26.10.0, LTS starts 2026-10-28 | same |
| Docker image tag (recommended) | `node:24-alpine` (exists, amd64/arm64) ; `node:24-slim` if a glibc-only native dep appears | https://hub.docker.com/_/node |
| Local machine note | Local Node here is v22.21.1. It is BELOW the minimums of Nest CLI 12 (22.22.3+/24.15+), jsdom 30 (22.22.2+/24.15+) and react-router 8 (22.22+). Build in Docker on Node 24 or upgrade local Node. | npm `engines` fields |

## 2. Backend packages

Two coherent sets. Recommended default for low risk (Set A) and the current-major alternative (Set B).

Set A: NestJS 11 line (CommonJS + Jest, best-known by AI agents, still patched)

| Package | Version | Source |
|---|---|---|
| @nestjs/core, common, platform-express, testing | 11.2.6 (2026-09-23) | https://www.npmjs.com/package/@nestjs/core (tag `legacy`) |
| @nestjs/cli | 11.0.24 | npm |
| @nestjs/swagger | 11.4.7 | npm |
| @nestjs/jwt | 11.0.2 | npm |
| @nestjs/passport | 11.0.5 | npm |
| @nestjs/config | 4.0.4 (12.x is the Nest 12 line) | npm |
| @nestjs/throttler | 6.7.1 (peers 7..12) | npm |
| nestjs-pino | 5.2.1 (peers pino ^10, pino-http ^11, nest ^11.0.8 or ^12.0.2, node >=22.12) | npm |
| pino / pino-http | 10.3.1 / 11.0.0 | npm |

Set B: NestJS 12 line (latest)

| Package | Version | Source |
|---|---|---|
| @nestjs/core, common, platform-express, testing | 12.1.1 (12.0.0 was 2026-08-27; 12.1.1 is 2026-09-28) | https://github.com/nestjs/nest/releases/tag/v12.0.0 |
| @nestjs/cli | 12.0.8 (CLI itself needs Node 22.22.3+ / 24.15+ / 26+) | https://docs.nestjs.com/migration-guide |
| @nestjs/swagger | 12.0.2 (peers typescript ^5.5 or ^6; node ^20.19 or >=22.12) | npm |
| @nestjs/jwt | 12.0.2 | npm |
| @nestjs/passport | 12.0.0 (peer passport ^0.7.0) | npm |
| @nestjs/config | 12.0.1 (now validates via Standard Schema, not Joi-specific) | https://github.com/nestjs/nest/releases/tag/v12.0.0 |
| @nestjs/throttler | 6.7.1 | npm |
| nestjs-pino | 5.2.1 | npm |

Common to both sets

| Package | Version | Note |
|---|---|---|
| helmet | 8.3.0 | npm |
| class-validator | 0.15.1 | Still fully supported in Nest 12 ("no plan to remove") |
| class-transformer | 0.5.1 | npm |
| cookie-parser | 1.4.7 | needs @types/cookie-parser for TS |
| bcryptjs | 3.0.3 | Ships its own types (`umd/index.d.ts` for require, `index.d.ts` for import). `@types/bcryptjs` 3.0.0 is a deprecated stub, do NOT install. v3 is dual ESM/CJS with an `exports` map. |
| decimal.js | 10.6.0 | Ships `decimal.d.ts` |
| passport / passport-jwt | 0.7.0 / 4.0.1 | npm |
| pg / @types/pg | 8.23.0 / 8.23.1 | npm |
| typescript | 5.9.3 (or 6.0.3). NOT 7.0.2 | swagger 12 peer, ts-jest peer `<7` |
| rxjs / reflect-metadata | 7.8.2 / 0.2.2 | npm |
| argon2 (alternative to bcryptjs) | 0.45.1 (native) | avoid on alpine unless needed |

## 3. Backend testing

| Item | Finding | Source |
|---|---|---|
| Default runner in Nest CLI | CLI 12: Jest for CommonJS projects, Vitest for ESM projects; oxlint replaces ESLint by default. `nest new` in v12 prompts CJS vs ESM. CLI 11 = Jest 30 + ts-jest. | https://docs.nestjs.com/migration-guide , https://www.infoq.com/news/2026/04/nestjs-12-roadmap-esm/ |
| jest / ts-jest / @types/jest | 30.5.2 / 29.4.14 (peers jest 29 or 30, typescript >=4.3 <7) / 30.0.0 | npm |
| vitest (if chosen for backend) | 5.0.2 (needs SWC plugin for `emitDecoratorMetadata`, esbuild/oxc do not emit it) | npm, general known constraint (UNVERIFIED for vitest 5) |
| @testcontainers/postgresql | 12.2.0 (depends on testcontainers ^12.2.0) | npm |
| supertest / @types/supertest | 7.3.0 / 7.2.1 | npm |

## 4. ORM decision

### Comparison

| Criterion | Prisma 7.10.0 | Drizzle 0.45.3 (+ kit 0.31.11) | TypeORM 1.1.1 |
|---|---|---|---|
| Status | 7.10.0 stable. 8.0.0-rc.19 is npm `latest` for CLI (GA expected Oct 2026 per Prisma). Pin 7.10.0. | 0.x stable, published 2026-09-21. 1.0 rc.4 (2026-06-27) is `rc`. Active. | 1.x, 1.1.1 published 2026-09-01. Active. |
| CommonJS in Nest | Needs generated client in-repo with `moduleFormat = "cjs"`, plus `prisma generate` in build and Docker. Nest recipe documents this. | Package is dual (`main ./index.cjs`), no generate step, plain import. | CommonJS, decorators, natural fit. |
| CHECK constraints | Not in schema. Hand-edit migration SQL (`migrate dev --create-only`). Not modelled, not drift-checked. | `check('name', sql\`...\`)` in table definition, emitted into SQL migration. | `@Check()` decorator; migrations are TS classes with `queryRunner.query()` (not plain .sql). |
| Unique expression index `lower(col)` | Not supported in schema ("indexes using a function are not yet supported", invisible to db pull). Hand-written SQL only. | `uniqueIndex('x').on(sql\`lower(${t.col})\`)` declarative. | Raw SQL in migration; entity decorators cannot express it. |
| pg_trgm GIN | `@@index([f], type: Gin, ops: raw("gin_trgm_ops"))` supported. `CREATE EXTENSION` by hand in migration SQL. | `index('x').using('gin', t.col.op('gin_trgm_ops'))`. Extension via `drizzle-kit generate --custom` SQL migration. | Raw SQL in migration. |
| Exact decimals | `Decimal` maps to `Prisma.Decimal` (decimal.js). Good. | `numeric({precision, scale})` returns string by default. Convert to decimal.js at the boundary. Good and explicit. | numeric returns string; needs transformer. OK. |
| Row locks | Only via `$queryRaw` `SELECT ... FOR UPDATE` inside interactive `$transaction`. | `.for('update')` on select builder inside `db.transaction`. First class. | `setLock('pessimistic_write')` first class. |
| Committed SQL migrations | Yes, `prisma/migrations/*/migration.sql`, `migrate deploy` at start (CLI must be in the runtime image). | Yes, `drizzle/NNNN_name.sql` + `meta/_journal.json` (0.31 layout), applied via `migrate()` from `drizzle-orm/node-postgres/migrator` in app code (no CLI needed at runtime). | TS migration classes, not plain SQL. |
| Risk for AI agents | Prisma 7 changes (prisma.config.ts, adapters, generator `prisma-client`, no auto env loading) are new; older-Prisma habits produce broken output. RC on `latest` tag is a trap. | Good API knowledge in models; 0.x to 1.0 rename risk only if versions float (pin). RQB v1 removed in 1.0 only. | Familiar but 0.3 to 1.x drift and heavy decorator/relations magic. |

### Recommendation: Drizzle ORM 0.45.3 + drizzle-kit 0.31.11 + pg 8.23.0

Rationale: it is the only option where CHECK constraints, the lower(email) unique index and pg_trgm GIN indexes are declared in the schema AND emitted into committed .sql migrations (no hand-edited, undrifted SQL), it has native `FOR UPDATE`, exact NUMERIC as strings, no codegen step and no ESM/CJS friction in a Nest CommonJS build. Migrations can run in-app so the runtime image needs no CLI.

Fallback if Drizzle's 0.x status is unacceptable: Prisma 7.10.0 (`prisma@7.10.0`, `@prisma/client@7.10.0`, `@prisma/adapter-pg@7.10.0`, exact pins, never `latest`), with hand-edited migration SQL for CHECK and lower() index.

Minimal known-good Drizzle shape (config only; UNVERIFIED, drizzle-kit was not run here, inspect the generated SQL once):

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Schema idioms (from https://orm.drizzle.team/docs/indexes-constraints):
- `check('total_nonneg', sql\`${t.total} >= 0\`)` in the table's third argument array.
- `uniqueIndex('users_email_lower_uq').on(sql\`lower(${t.email})\`)`.
- `index('x_trgm').using('gin', t.name.op('gin_trgm_ops'))`.
- `numeric('amount', { precision: 14, scale: 2 })` (string in and out).
- Lock: `db.transaction(async (tx) => tx.select().from(t).where(...).for('update'))`.
- Custom migration: `drizzle-kit generate --custom --name=pg_trgm` and put `CREATE EXTENSION IF NOT EXISTS pg_trgm;` in it. Generate it BEFORE the migration that creates the GIN index, or migration order breaks (custom SQL migrations are otherwise timestamp/sequence ordered).
- Programmatic apply: `migrate(db, { migrationsFolder })` from `drizzle-orm/node-postgres/migrator`.

Prisma 7 known-good shape (fallback), from https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7 and https://docs.nestjs.com/recipes/prisma :
- `schema.prisma`: `generator client { provider = "prisma-client"  output = "../src/generated/prisma"  moduleFormat = "cjs" }` and `datasource db { provider = "postgresql" }` (no `url` in the schema).
- `prisma.config.ts` at project root: `defineConfig({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' }, datasource: { url: env('DATABASE_URL') } })` from `prisma/config`. Env files are NOT auto-loaded, import `dotenv/config` or inject env.
- Client: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` with `@prisma/adapter-pg`. Import from the generated path, Nest recipe uses `'../generated/prisma/client.js'` with a `.js` suffix.

## 5. PostgreSQL

| Item | Finding | Source |
|---|---|---|
| Recommended image | `postgres:18-alpine` (18.6, supported to 2030-11-14). `postgres:17-alpine` (17.11, to 2029-11-08) is the conservative alternative and avoids the PGDATA change. Both tags exist. | https://hub.docker.com/_/postgres , https://www.postgresql.org/support/versioning/ |
| PG18 PGDATA gotcha | Image changed `PGDATA` to be version specific: `/var/lib/postgresql/18/docker`. Mount the volume at `/var/lib/postgresql` (NOT `/var/lib/postgresql/data`). Mounting at the old path leaves data in the container layer (lost on `down -v`/recreate) or triggers an init error about the mount. | Docker Hub official image page |
| Extensions | pg_trgm ships in the contrib bundled with the official image (alpine included); `CREATE EXTENSION pg_trgm` works for the superuser. | general Postgres docs, UNVERIFIED on alpine tag here |

## 6. Frontend packages

| Package | Version | Note / source |
|---|---|---|
| react, react-dom | 19.3.0 | npm |
| @types/react, @types/react-dom | 19.3.0 | npm |
| vite | 8.3.1 (Rolldown/oxc based; engines node ^20.19 or >=22.12) | npm |
| @vitejs/plugin-react | 6.1.1 (peer vite ^8.0.0 only; not compatible with vite 7) | npm |
| typescript | 5.9.3 or 6.0.3 (avoid 7.0.2 until tooling catches up) | npm |
| @tanstack/react-query | 5.104.0 (peer react ^18 or ^19) | npm |
| react-router | 7.18.4 (recommended, v7 line tag `version-7`) ; 8.4.0 is `latest` | https://reactrouter.com/upgrading/v7 |
| react-router-dom | 7.18.4 exists but is removed in v8. To be forward compatible, install only `react-router` and import `RouterProvider` from `react-router/dom`, everything else from `react-router`. | https://remix.run/blog/react-router-v8 |
| react-hook-form | 7.89.0 | npm |
| zod | 4.6.5 (import from `"zod"`) | npm |
| @hookform/resolvers | 5.9.1, peers `zod ^3.25 or ^4`, `react-hook-form ^7.55`. Zod v4 compatible via Standard Schema. Use `zodResolver` from `@hookform/resolvers/zod`. | npm |
| tailwindcss + @tailwindcss/vite | 4.3.3 (plugin peers vite 5 to 8). CSS: `@import "tailwindcss";`, no tailwind.config needed. | npm, https://ui.shadcn.com/docs/installation/vite |
| vitest | 5.0.2 (peer vite ^6.4 or ^7 or ^8; engines node ^22.12, ^24, >=26; peer @types/node ^22 or >=24) | npm |
| @vitest/coverage-v8 | 5.0.2 (must equal vitest version) | npm |
| @testing-library/react | 16.3.3 (REQUIRES explicit peer `@testing-library/dom` 10.4.2) | npm |
| @testing-library/dom | 10.4.2 | npm |
| @testing-library/user-event | 14.6.7 | npm |
| @testing-library/jest-dom | 7.0.1 | npm |
| jsdom | 30.1.1 (engines node ^22.22.2 or ^24.15 or >=26, fails on Node 22.21) | npm |
| msw | 2.15.0 recommended (2.x). 3.0.0 is `latest` but 2 days old, peers typescript >=5.9.x, node >=22.12. | npm |
| shadcn (CLI) | 4.21.0 | npm |
| lucide-react, clsx, tailwind-merge, class-variance-authority | 1.49.0, 2.1.1, 3.7.0, 0.7.1 | npm (shadcn deps) |
| @playwright/test (optional) | 1.63.0 | npm |
| @types/node | pin the 24.x line (24.19.0 at time of writing) to match Node 24 | npm |

## 7. shadcn/ui with Vite + Tailwind v4

Manual pre-steps (https://ui.shadcn.com/docs/installation/vite): install `tailwindcss @tailwindcss/vite`; `src/index.css` = `@import "tailwindcss";`; add `baseUrl: "."` and `paths: { "@/*": ["./src/*"] }` to BOTH `tsconfig.json` and `tsconfig.app.json`; install `@types/node`; add the `@tailwindcss/vite` plugin and `resolve.alias` `@` to `./src` in `vite.config.ts`.

CLI 4.21.0 `init` flags (verified via `npx shadcn@4.21.0 init --help`): `-t/--template` (next, start, vite, react-router, laravel, astro), `-b/--base` (base, radix, aria), `-p/--preset [name]`, `-y/--yes` (default true, skips confirmation), `-d/--defaults` (forces `--template=next --preset=base-nova`, so do NOT use `-d` for a Vite app), `-f/--force`, `-c/--cwd`, `-n/--name`, `-s/--silent`, `--css-variables`, `--no-monorepo`, `--rtl/--no-rtl`, `--pointer/--no-pointer`. There is NO `--base-color` flag any more; styling comes from `--preset`.

Non-interactive candidate: `npx shadcn@4.21.0 init -t vite -b radix -y --no-monorepo` (add `-p <preset>` to pin a preset). UNVERIFIED end to end here (not run inside a real Vite project). `add` flags: `-y`, `-o/--overwrite`, `-a/--all`, `-p/--path`, `-c/--cwd`, `--dry-run`, e.g. `npx shadcn@4.21.0 add button input label card table dialog -y`. Pin the CLI version instead of `@latest` so the run is reproducible.

## 8. Gotchas and incompatibilities

1. Nest 12 packages are ESM-only. CommonJS Nest apps still work through Node `require(esm)` (Node 20.19+, 22.12+, 24+). `nest upgrade` deliberately keeps the module format. Docs say Jest with CJS projects needs Node 24.9+ for ESM packages or you risk `ERR_REQUIRE_ASYNC_MODULE` (https://docs.nestjs.com/migration-guide). UNVERIFIED that Jest 30 + ts-jest passes on a Nest 12 CJS scaffold. This is the main reason Set A (Nest 11.2.6) is the low-risk default. If Set B is chosen, run a smoke `nest new` (CJS) + `npm test` on `node:24-alpine` first.
2. Nest 12 recommended tsconfig for new projects: `module: nodenext`, `moduleResolution: nodenext`, `resolvePackageJsonExports: true`, target ES2023+. In ESM mode, relative imports need `.js` extensions and `__dirname` is gone (`import.meta.dirname`).
3. Do not float `typescript`, `prisma`, `msw`, `react-router` to `latest`: TS 7.0.2, prisma CLI 8.0.0-rc.19, msw 3.0.0 and react-router 8.4.0 are each `latest` and each breaks or moves something. Pin exact versions (`--save-exact`) and commit the lockfile.
4. `@hookform/resolvers` 5.x works with zod 3.25+ and 4; use zod 4 API (`z.email()`, `z.string().min()`, error customisation via `error` option; `message` is deprecated). No incompatibility found, do not install `@hookform/resolvers` 3.x/4.x.
5. `@testing-library/react` 16 needs `@testing-library/dom` installed by you (peer, not bundled).
6. vitest 5 + vite 8 + plugin-react 6 + jsdom 30 all need Node >= 22.12 (jsdom 30: 22.22.2 or 24.15+). plugin-react 6 requires vite 8 (not 7). Vitest config should live in `vite.config.ts` via `defineConfig` from `vitest/config`; set `environment: 'jsdom'` and a setup file importing `@testing-library/jest-dom/vitest`.
7. msw 3.0.0 is a brand new major; use 2.15.0 (`setupServer` from `msw/node`, `http.get`, `HttpResponse`).
8. react-router: with v7, import from `react-router` and `react-router/dom` only. Data mode is `createBrowserRouter` + `<RouterProvider>`. v8 needs Node 22.22+, React 19.2.7+ and is ESM only.
9. Prisma (fallback only): schema `datasource` has no `url` in v7, env not auto-loaded, client engine requires a driver adapter, `moduleFormat = "cjs"` must be set explicitly for Nest CJS (releases before 7.10 inferred ESM from `module: nodenext` even in CJS projects), `--skip-generate` flag removed, generated client lives in `src/` so it must be built by `tsc` (add to Docker build after `prisma generate`).
10. Drizzle: pin `drizzle-orm@0.45.3` and `drizzle-kit@0.31.11` together, never mix with `1.0.0-rc/beta` (folder-per-migration layout and `casing`/RQB changes in v1). Default `numeric` is string typed; do not switch to `mode: 'number'` for money. Always review the generated SQL for the expression unique index and the GIN opclass, and create pg_trgm before the index migration.
11. Postgres 18 image: mount at `/var/lib/postgresql`, not `/var/lib/postgresql/data`. Use a `pg_isready` healthcheck and `depends_on: condition: service_healthy` for the API.
12. `bcryptjs` 3.x is pure JS and ships types; skip `@types/bcryptjs`. Use `import * as bcrypt from 'bcryptjs'` or `import bcrypt from 'bcryptjs'` depending on `esModuleInterop`. (UNVERIFIED which form under the chosen tsconfig.)
13. `nestjs-pino` 5.2.1 requires Node >=22.12 and `pino` ^10 / `pino-http` ^11 (do not install pino 9).
14. Nest CLI 12 refuses Node 23.x/25.x and Node 22 below 22.22.3. Use `node:24-alpine` for scaffolding.

## Source list

- Node schedule: https://github.com/nodejs/Release/blob/main/schedule.json ; https://nodejs.org/dist/index.json
- Nest migration guide: https://docs.nestjs.com/migration-guide ; release: https://github.com/nestjs/nest/releases/tag/v12.0.0 ; roadmap news (secondary): https://www.infoq.com/news/2026/04/nestjs-12-roadmap-esm/
- Nest Prisma recipe: https://docs.nestjs.com/recipes/prisma
- Prisma 7 upgrade: https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7 ; generators: https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators ; indexes: https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes ; unsupported features: https://www.prisma.io/docs/orm/prisma-migrate/workflows/unsupported-database-features
- Drizzle: https://orm.drizzle.team/docs/indexes-constraints ; https://orm.drizzle.team/docs/kit-custom-migrations ; https://github.com/drizzle-team/drizzle-orm/releases
- TypeORM releases: https://github.com/typeorm/typeorm/releases (WebFetch summary showed wrong years, dates above are npm publish times)
- Postgres image: https://hub.docker.com/_/postgres ; versions: https://www.postgresql.org/support/versioning/
- React Router: https://reactrouter.com/upgrading/v7 ; https://remix.run/blog/react-router-v8
- shadcn: https://ui.shadcn.com/docs/cli ; https://ui.shadcn.com/docs/installation/vite ; `shadcn@4.21.0 init --help`
- All versions and peer/engine fields: npm registry (`npm view <pkg>`), 2026-09-30
