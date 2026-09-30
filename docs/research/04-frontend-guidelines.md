# Frontend guidelines (React 19 SPA, Vite, FSD)

Scope: client-side SPA in `frontend/`. TanStack Query, React Router (library mode),
react-hook-form + zod, Tailwind v4 + shadcn/ui. No SSR, no RSC, no Next.js.
Full rules live in the project skills: `.claude/skills/feature-sliced-design/`
(official, FSD v2.1) and `.claude/skills/react-best-practices/` (Vercel, 70 rules).

## 1. FSD layout applied to this app

Layers, top to bottom: app > pages > widgets > features > entities > shared.
A module may import only from layers strictly below it. Slices on the same layer
never import each other. Import a slice only through its `index.ts`.

```text
frontend/src/
  app/        providers (QueryClientProvider, RouterProvider), router.tsx, global CSS, layout route
  pages/
    login/            ui/LoginPage.tsx
    invoice-list/     ui/InvoiceListPage.tsx
    invoice-detail/   ui/InvoiceDetailPage.tsx, model/ (page-only queries)
    invoice-create/   ui/InvoiceCreatePage.tsx
  widgets/
    invoice-table/    ui/InvoiceTable.tsx (table + row actions, receives data via props)
    app-header/       ui/AppHeader.tsx (nav, user menu, logout)
  features/
    auth-login/           ui/LoginForm.tsx, model/schema.ts (zod), api/login.ts
    invoice-list-filters/ ui/Filters.tsx, model/useFilters.ts (URL search params)
    invoice-create/       ui/InvoiceForm.tsx, model/schema.ts, api/createInvoice.ts
  entities/
    invoice/  model/types.ts, model/queries.ts (queryOptions), api/, ui/InvoiceStatusBadge.tsx
    session/  model/ (current user + token store, useSession), api/getMe.ts
  shared/
    api/      client.ts (fetch/axios instance, auth header, 401 handling)
    ui/       shadcn components (button, input, table, dialog ...)
    lib/      money/ (format, parse, integer minor units), date/
    config/   env.ts (VITE_* parsed with zod), routes.ts (path constants)
```

Rules of thumb (from the official skill, "start simple, extract when needed"):
- Code used by one page stays in that page. Extract to features/entities only when
  2+ consumers exist now, not hypothetically.
- Each slice has `ui/`, `model/`, `api/`, `lib/`, `config/` segments as needed, named by purpose.
- `index.ts` exports only what other layers need. No `index.ts` at layer level.
  No `export *` in slice indexes (keeps tree-shaking and Steiger happy).
- Query keys and `queryOptions` live in `entities/invoice/model`. Mutations live in the
  feature that triggers them (`features/invoice-create/api`), and invalidate the entity key
  through the entity public API.
- Route wiring is in `app/router.tsx`: each route element is a `pages/*` component.
  Pages are code-split there with `React.lazy`.
- Path alias `@/*` to `src/*` in `tsconfig.json` and `vite.config.ts`.
- Money: only through `shared/lib/money`. Never float math on amounts.
- Static assets sit next to the code that uses them. Global CSS and fonts go in `app/`.

Decisions to confirm (the official skill pushes back on these two):
1. `widgets/` is discouraged in FSD v2.1 (unclear boundary with features). Kept here because
   `invoice-table` and `app-header` are reused blocks. Fallback: `invoice-table` into
   `pages/invoice-list`, `app-header` into the `app/` layout route.
2. The skill prefers `shared/auth` for tokens and says not to make a `user` entity only for
   auth data. `entities/session` is acceptable if it owns current-user state that other slices
   read. If it only holds the token, move it to `shared/auth` and drop the entity.
   Either way the token must reach `shared/api/client.ts` without importing upward
   (inject it from `app/` at startup, or read it from `shared/auth`).

## 2. Vercel rules that apply to a Vite SPA

Use (the ones that matter for this app):
- Waterfalls (CRITICAL): fire independent queries in parallel (`useQueries`, or start
  queries at the same level, prefetch in route loader/hover). Do not chain `enabled` flags
  unless data truly depends on the previous result. `async-parallel`, `async-defer-await`,
  `async-cheap-condition-before-await`, `async-suspense-boundaries` (Suspense/skeleton
  boundaries around widgets so the page shell paints first).
- Bundle (CRITICAL): `bundle-barrel-imports` (the Next-only `optimizePackageImports` fix does not apply; in Vite
  prefer libraries with per-module imports and check subpath typings, e.g. lucide-react deep
  paths lack `.d.ts`; our own slice `index.ts` files are small and fine),
  `bundle-dynamic-imports` (use `React.lazy` per route and for heavy widgets, not `next/dynamic`),
  `bundle-preload` (preload a route chunk on link hover/focus), `bundle-defer-third-party`,
  `bundle-conditional`, `bundle-analyzable-paths` (literal `import()` paths for Vite/Rollup).
- Client data (MED-HIGH): `client-swr-dedup` is satisfied by TanStack Query (same key is
  deduped, set a sensible `staleTime`). `client-event-listeners`, `client-passive-event-listeners`,
  `client-localstorage-schema` (version and minimize what we store, e.g. the token or filters).
- Re-render (MED): all `rerender-*` rules apply. Highlights: derive state during render not in
  effects, no components defined inside components, functional `setState`, primitive effect
  deps, `startTransition`/`useDeferredValue` for filter typing, keep filter state in the URL.
  React Compiler, if enabled, makes manual `memo` and JSX hoisting mostly unnecessary.
- Rendering (MED): `rendering-conditional-render` (ternary, not `&&` with numbers),
  `rendering-content-visibility` for long tables, `rendering-usetransition-loading`,
  `rendering-activity`, `rendering-hoist-jsx`, `rendering-svg-precision`, `rendering-animate-svg-wrapper`.
- JS (LOW-MED): all `js-*` rules are plain JavaScript and apply (Map/Set lookups,
  `toSorted`, early exit, hoisted RegExp), useful in `shared/lib/money` and table code.
- Advanced (LOW): `advanced-*` (event-handler refs, `useLatest`, init once) as needed.

Skipped (and why):
- `server-*` (10 rules: RSC props, `React.cache`, LRU, server actions auth, `after()`): no server
  runtime in the SPA. Auth is enforced by the backend API.
- `async-api-routes`: Next.js route handlers, none here.
- `rendering-hydration-no-flicker`, `rendering-hydration-suppress-warning`: SSR hydration only.
- `rendering-script-defer-async`, `rendering-resource-hints` (React DOM preload APIs meant for
  server components): in a Vite SPA put `<link rel="preconnect">` and `<script type="module">`
  in `index.html`; Vite already emits module scripts (deferred).
- `async-dependencies` (`better-all` library): not adding a dependency, use `Promise.all`/`useQueries`.
- `client-swr-dedup` as written (SWR): replaced by TanStack Query, see above.

## 3. Enforcing FSD boundaries cheaply

Recommended by feature-sliced.design and the official skill: Steiger, the official FSD linter
(checked 2026-09-30: `steiger` 0.7.0, `@feature-sliced/steiger-plugin` 0.8.0, beta, actively developed).
It has no ESLint dependency, reads the folder tree, and needs zero config.

```bash
npm i -D steiger @feature-sliced/steiger-plugin
npx steiger ./src            # add to package.json as "lint:fsd" and run in CI
```

```ts
// frontend/steiger.config.ts
import { defineConfig } from 'steiger'
import fsd from '@feature-sliced/steiger-plugin'
export default defineConfig([...fsd.configs.recommended])
```

Rules that carry the boundary checks: `fsd/forbidden-imports` (higher-layer imports and same-layer
cross-imports), `fsd/no-public-api-sidestep`, `fsd/public-api`, `fsd/no-layer-public-api`,
`fsd/insignificant-slice` (slices with 0-1 consumers, keeps us from over-slicing),
`fsd/no-segmentless-slices`, `fsd/no-ui-in-app`.

Notes:
- Do not use `@feature-sliced/eslint-config`: last pushed 2024-10, self-described as beta.
- Alternative if the team wants everything inside ESLint: `eslint-plugin-boundaries` with one
  element type per layer and an `allow` matrix. More config to maintain, not FSD-aware
  (no slice or public-API semantics out of the box). Not evaluated here, use only if Steiger is rejected.
- Cheap extra guard: `tsconfig` path alias `@/*` only, ban `../../` relative hops across slices in review.
- Steiger is a linter (structure and imports). It does not check performance rules; those come
  from code review with the `react-best-practices` skill.
