# SimpleInvoice Web

Single Page App for the 101 Digital SimpleInvoice assessment: login, invoice list (search, filters, sort, paging), invoice detail and invoice creation.

- React 19, Vite 8, TypeScript 5.9 (strict)
- Feature-Sliced Design v2.1 (checked by Steiger)
- TanStack Query for server data, react-hook-form + zod for forms, React Router 7
- Tailwind CSS 4 + shadcn/ui components
- Vitest, Testing Library and MSW for tests

This app is one half of the SimpleInvoice monorepo. The backend is in [`../backend`](../backend), the `docker-compose.yml` for the whole stack is at the repository root, and the specification, architecture and decision log are in [`../docs/`](../docs). See the [root README](../README.md) for the project structure.

## Quick start

### Whole stack with Docker (recommended)

Run compose from the repository root:

```bash
docker compose up -d --build
```

Open http://localhost:8080 and log in with `demo@example.com` / `SimpleInvoice-Demo-2026` (ACCOUNTANT, can create invoices) or `auditor@example.com` / `SimpleInvoice-Demo-2026` (AUDITOR, read only). These are public demo credentials required by the brief. See the [root README](../README.md) for ports and options.

In Docker the app is built once and served by an unprivileged nginx, which also proxies `/api/*` to the backend, so the browser talks to one origin only.

### Development server

Requirements: Node 24 LTS and the API running on http://localhost:3000 (see [`../backend/README.md`](../backend/README.md), "Running without Docker"). Run the commands below from the `frontend/` folder.

```bash
npm ci
cp .env.example .env   # optional, only to point the proxy at another API address
npm run dev
```

Open http://localhost:5173. Vite forwards `/api/*` to `VITE_API_PROXY_TARGET` (default `http://localhost:3000`) and removes the `/api` prefix.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type check and production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit and component tests (Vitest, MSW mocks the API) |
| `npm run lint` | ESLint |
| `npm run lint:fsd` | Steiger: Feature-Sliced Design rules (layers, public APIs) |

## Structure

```
src/
  app/        router, providers, route guards, app shell layout
  pages/      login, invoice-list, invoice-detail, invoice-create, not-found
  features/   auth-login, invoice-create (forms and their logic)
  entities/   invoice (types, API queries, status badge, money display)
  shared/     api client, auth session, config, ui kit, helpers
```

Imports only go down the layers (`app > pages > features > entities > shared`). Each slice exposes a public API through its `index.ts`.

## Screens

| Route | Screen |
|---|---|
| `/login` | Login form. Same error for wrong email or wrong password. |
| `/invoices` | List with keyword search, status and date filters, sort and paging. All filters live in the URL, so a list view can be shared and the back button works. |
| `/invoices/:id` | Invoice detail: header, customer, items and amounts. "Back to invoices" returns to the exact list view the user came from. |
| `/invoices/new` | Create form (ACCOUNTANT only). The server calculates all totals. |

## Security and correctness

- **Access token in memory only**, never in `localStorage` or `sessionStorage`, so an XSS bug cannot read a stored token. After a page reload the session is restored with the `HttpOnly` refresh cookie.
- **One refresh at a time**: many parallel `401` answers trigger a single refresh call, and the Web Locks API stops two browser tabs from refreshing at the same moment (which the server would see as token reuse).
- **Money is never a JavaScript number**. Amounts come from the API as decimal strings and are formatted with `Intl.NumberFormat` straight from the string. The app never calculates invoice totals.
- **Exactly-once create**: each create request carries an `Idempotency-Key`. A retry with the same form data reuses the key, so a double click or a network retry never creates two invoices.
- **Safe redirects**: after login the app only returns to paths inside the app; `//evil.com` and full URLs are refused.
- **CSRF**: refresh and logout send `X-Requested-With: SimpleInvoice`; the server also checks `Origin` and `Sec-Fetch-Site`.
- **Headers** (nginx): strict Content Security Policy (no inline scripts), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`.

Details: [`../docs/SPEC.md`](../docs/SPEC.md) sections 7 and 8, and [`../docs/DECISIONS.md`](../docs/DECISIONS.md).

## Known limitations

- The SPA holds the access token in JavaScript memory (the brief requires a login that returns a JWT). A Backend-for-Frontend, where tokens never reach the browser, is the stronger pattern for high-value apps.
- A browser without the Web Locks API falls back to single-tab protection only; two tabs refreshing at the exact same moment can then end the session.
