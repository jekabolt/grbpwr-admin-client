# grbpwr-admin-client

Admin panel for the GRBPWR e-commerce platform. A single-page React application that lets staff manage the full storefront: products, media, orders, hero/promo content, archive timeline, shipping, customer support, membership tiers, and an analytics dashboard.

It talks to the GRBPWR backend over an HTTP/gRPC gateway using TypeScript clients generated from the [`grbpwr-proto`](https://github.com/jekabolt/grbpwr-proto) contracts.

## Tech stack

| Area | Choice |
|------|--------|
| Framework | React 19 + TypeScript 5 |
| Build tool | Vite 6 (dev server on port `4040`) |
| Package manager | Yarn |
| Routing | React Router DOM 7 (`BrowserRouter`) |
| Server state | TanStack React Query 5 |
| Global UI state | Zustand 5 |
| Styling | Tailwind CSS 4 (PostCSS) + SCSS |
| UI primitives | Radix UI + a local component library in `src/ui` |
| Forms / validation | React Hook Form + Yup / Zod (Formik in some legacy screens) |
| Charts / maps | Recharts, react-simple-maps |
| Image cropping | react-advanced-cropper, react-easy-crop, react-image-crop |
| API codegen | `buf` + `protoc-gen-typescript-http` |
| Hosting | Vercel |

## Prerequisites

- **Node.js** — the version pinned in `.nvmrc` (`lts/*`). Run `nvm use` if you use nvm.
- **Yarn**
- **buf** — `brew install bufbuild/buf/buf`
- **protoc-gen-typescript-http** — must be installed and on your `$PATH` (used by `buf generate`).

The last two are only needed to **regenerate** the API clients. Generated code is checked in, so a plain install/run does not require them.

## Getting started

```bash
# 1. Clone with submodules (the proto contract is a git submodule)
git clone --recurse-submodules https://github.com/jekabolt/grbpwr-admin-client.git
cd grbpwr-admin-client

# 2. Install dependencies
make install            # or: yarn install

# 3. Generate the API clients from proto (init submodules + buf generate)
make init

# 4. Configure environment
cp .env.example .env    # then edit the values (see below)

# 5. Start the dev server
make dev                # or: yarn dev

# 6. Open the app
open http://localhost:4040
```

### Environment variables

Create a `.env` in the repo root. The app reads Vite-prefixed variables:

| Variable | Used by | Description |
|----------|---------|-------------|
| `VITE_SERVER_URL` | `src/api/api.ts` | Base URL of the backend HTTP/gRPC gateway. **Required.** |
| `VITE_MEDIA_PROXY_URL` | `src/lib/features/getCropped.ts` | Optional. Override for the media proxy used when cropping remote images. |
| `VITE_API_BASE_URL` | `vite.config.ts` | Optional. Target for the dev-server `/api` proxy. Defaults to `http://localhost:3999`. |

Example:

```dotenv
VITE_SERVER_URL="https://api.example.com"
```

> Note: `.env.example` historically shipped a stale `REACT_APP_SERVER_URL` key. The runtime reads `VITE_SERVER_URL` — use that.

## Scripts

| Command | What it does |
|---------|--------------|
| `make dev` / `yarn dev` | Start the Vite dev server on `:4040`. |
| `make build-dist` / `yarn build` | Production build to `dist/`. |
| `yarn build:check` | Type-check (`tsc`) then build. |
| `yarn preview` | Serve the production build locally. |
| `yarn lint` | ESLint with autofix over `src/`. |
| `yarn format` | Prettier write over `src/`. |
| `yarn fix` | `lint` + `format`. |
| `make init` | Init submodules + regenerate proto clients (`buf generate`). |
| `make proto` | Regenerate proto clients only. |
| `make clean` | Remove `dist/` and generated `src/api/proto-http/*`. |

## Project layout

```
src/
  api/
    api.ts                 # Fetch wrapper + service clients (admin / auth / frontend)
    proto-http/            # Generated clients: admin, auth, frontend, common
  components/
    login/                 # Auth screen + ProtectedRoute
    managers/              # Feature areas (one folder per domain)
      page/                #   Analytics dashboard (route /main)
      media/  product/  products-catalog/
      order/  orders-catalog/  custom-orders/
      hero/  promo/  archive/  archives/
      settings/  shipping/  customer-support/
      membership/          #   members, tier-config, hacker, audit
  ui/                      # Design system: layout, components, form fields, icons
  lib/
    providers/             # DictionaryProvider (global reference data)
    stores/                # Zustand stores (e.g. snackbar)
    features/              # Pure helpers (cropping, dates, categories, sku, ...)
  constants/               # routes.ts, filters, product + garment constants
  context/                 # Minimal React context scaffold
  hooks/                   # Shared hooks (e.g. useBlockNavigation)
  index.tsx                # App entry: providers, router, lazy routes
api/media-proxy.js         # Vercel serverless image proxy (production)
docs/                      # Architecture notes (e.g. analytics-dashboard.md)
proto/                     # grbpwr-proto git submodule (API contract source)
```

## How it works

- **Auth** — Login (`authService.Login`) returns a JWT stored in `localStorage` under `authToken`. `ProtectedRoute` decodes the token's `exp` client-side and redirects to the login screen when it is missing or expired. The token is sent on every request as the `Grpc-Metadata-Authorization: Bearer <token>` header.
- **API** — `src/api/api.ts` exports `adminService`, `authService`, and `frontendService`, built from the generated proto clients with a shared `fetch`-based `requestHandler`.
- **Routing** — All routes are defined as the `ROUTES` enum in `src/constants/routes.ts` and wired in `src/index.tsx`. Authenticated pages render under a shared `ProtectedLayout` (`ProtectedRoute` + `Layout`) and are lazy-loaded for code splitting. The default authenticated landing page is the analytics dashboard at `/main`.
- **Reference data** — `DictionaryProvider` fetches `adminService.GetDictionary()` once at startup and exposes shared lookup data (categories, sizes, measurements, etc.) to the app.

## Deployment

Hosted on Vercel (`vercel.json`). It builds with `vite build`, rewrites all routes to `index.html` (SPA), and exposes `/media-proxy` via the `api/media-proxy.js` serverless function. Set the `VITE_*` variables in the Vercel project settings.

## Regenerating the API

The `proto/` directory is a git submodule pointing at `grbpwr-proto`. To pull the latest contract and regenerate clients:

```bash
git submodule update --remote proto
make proto          # runs `buf generate` -> src/api/proto-http/*
```
