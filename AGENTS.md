# AGENTS.md

Guidance for coding agents (Codex and Claude Code) working in this repository. `CLAUDE.md` imports this file — edit only this one.

## What this is

`grbpwr-admin-client` — the React 19 + TypeScript admin SPA for the GRBPWR storefront. It is a pure frontend: all data comes from a backend HTTP/gRPC gateway via TypeScript clients generated from the `grbpwr-proto` contract. There is no local backend in this repo.

## Commands

```bash
yarn dev            # Vite dev server on :4040
yarn build          # production build -> dist/
yarn build:check    # tsc type-check + build  (use this to verify types)
yarn lint           # eslint --fix over src/
yarn format         # prettier --write over src/
yarn fix            # lint + format

make init           # init submodules + buf generate (regenerate proto clients)
make proto          # buf generate only
make clean          # remove dist/ and generated src/api/proto-http/*
```

There is **no test runner** configured. To verify a change, run `yarn build:check` (types) and exercise the UI in `yarn dev`.

## Environment

- Required: `VITE_SERVER_URL` — backend base URL (read in `src/api/api.ts`).
- Optional: `VITE_MEDIA_PROXY_URL`, `VITE_API_BASE_URL` (dev `/api` proxy, default `http://localhost:3999`).
- Optional but **set it on every deployed environment**: `VITE_PATTERN_VIEWER_ORIGIN` — the origin
  baked into the tech pack's pattern QR codes (`{origin}/p/{token}`). It defaults to
  `window.location.origin`, i.e. the address of the tab that pressed "save as pdf" — so printing
  from a Vercel _preview_ alias produces paper that points at an ephemeral, SSO-protected host and
  dies when the branch is renamed. Set it to the stable admin host of that contour
  (`https://admin.beta.grbpwr.com`, `https://admin.grbpwr.com`). Nothing fails visibly when it is
  wrong; the QR just stops working later, in a workshop.
- Optional, almost never needed: `VITE_FILE_SHARE_ORIGIN` — the origin of the public file-share
  landing page (`{origin}/f/{token}`) that the access block and the shared-files screen copy to
  the clipboard. It falls back to `VITE_PATTERN_VIEWER_ORIGIN` and then to the tab's own origin,
  so setting the pattern-viewer variable already covers it — all public pages are the same SPA on
  the same host. Set this one only if `/f/` ever moves to a domain of its own. The failure it
  guards against is the same silent one: a link copied from a Vercel preview is handed to a
  contractor and dies with the alias — which is why the tab fallback is refused when the tab
  itself is provably ephemeral (`localhost`, a bare IP, `*.vercel.app`). On such a host the
  address and its copy button are not rendered at all; on a stable host the tab origin _is_ the
  product origin and the button keeps working. See `src/components/file-share-viewer/link.ts`.
  `.env.example` documents both variables.
- `.env.example` lists a stale `REACT_APP_SERVER_URL` — the code uses `VITE_SERVER_URL`. Don't propagate the old name.

## Architecture

- **Entry**: `src/index.tsx` sets up the provider stack (top → bottom): `ErrorBoundary` → `DictionaryProvider` → `ContextProvider` → `QueryClientProvider` → `BrowserRouter` → routes. Routes are lazy-loaded for code splitting.
- **Routing**: route paths live in the `ROUTES` enum in `src/constants/routes.ts`. Authenticated pages render under `ProtectedLayout` (`ProtectedRoute` + `Layout`). The login screen is at `/`; the default authed landing is `/main` (analytics).
- **Auth**: `authService.Login` returns a JWT stored in `localStorage.authToken`. `src/components/login/protectedRoute.tsx` checks expiry by decoding the JWT `exp` client-side. `src/api/api.ts` attaches it as `Grpc-Metadata-Authorization: Bearer <token>`.
- **API layer**: `src/api/api.ts` exports `adminService`, `authService`, `frontendService` (built from generated clients in `src/api/proto-http/{admin,auth,frontend,common}`). All calls go through one `fetch`-based `requestHandler`.
- **Reference data**: `DictionaryProvider` (`src/lib/providers/dictionary-provider.tsx`) loads `adminService.GetDictionary()` once at startup. Read shared lookups (categories, sizes, measurements) from this context — don't refetch the dictionary.

## State management — pick the right tool

- **Server data** → TanStack React Query. Global defaults are set in `src/index.tsx` (`staleTime` 5 min, `retry` 1, no refetch on window focus).
- **Global reference data** → `DictionaryProvider` context.
- **Global UI state** (e.g. snackbar/toasts) → Zustand stores in `src/lib/stores`. Use `useSnackBarStore().showMessage(msg, 'success' | 'error')` for user feedback.
- **Forms** → React Hook Form + Yup/Zod is the current standard. Some older screens still use Formik; match whatever the file you're editing already uses rather than mixing both.

## Feature areas

Each domain is a folder under `src/components/managers/`: `page` (analytics), `media`, `product` / `products-catalog`, `order` / `orders-catalog` / `custom-orders`, `hero`, `promo`, `archive` / `archives` (timeline), `settings`, `shipping`, `customer-support`, and `membership` (members, member-details, tier-config, hacker, audit). When adding a screen, follow the existing folder's structure (`page.tsx` + `components/` + local hooks/utils).

## Conventions

- **Path aliases** (defined in both `vite.config.ts` and `tsconfig.json`, `baseUrl: src`): `@`, `api`, `components`, `constants`, `context`, `hooks`, `lib`, `types`, `ui`, `utils`, `styles`. Import with these, e.g. `import { adminService } from 'api/api'` — not relative `../../..` paths.
- **UI components**: import existing primitives only from `ui`, for example
  `import { Button, Input } from 'ui'`. Never import implementation paths such as
  `ui/components/...` or `ui/form/...`.
- **Styling**: Tailwind CSS 4 utility classes are the default; SCSS exists for some components. Match the surrounding file.
- **Formatting**: Prettier (single quotes, JSX single quotes, semicolons, width 100, trailing commas). Run `yarn fix` before finishing. Keep ESLint clean.
- **TypeScript**: `strict` is on. Avoid `any`; prefer the generated proto types from `api/proto-http/*` for backend shapes.

## Visual design: DESIGN.md + /ui-kit are the law

`DESIGN.md` defines the tokens and rules; `/ui-kit` shows every primitive live. The design linter
(`yarn lint:design`) enforces them as a ratchet. Import primitives only `from 'ui'`. The primitive
list is closed: do not add a file under `src/ui` without the owner's OK and a `[primitive-ok]`
commit marker.

- The page ground is grey (`pageBg`); white (`bgColor`) is the material of a block, not the page
  background.
- The 24px gap between blocks is the divider. Do not draw a separator in it.
- A block never contains another block. Use `GroupLabel` and `Row` for internal structure.
- `borderColor` is the outer outline; `hairline` is the inner rule between rows.
- Modals, boards, tiles, `StatGrid`, and storefront/email preview iframes are already surfaces. Do
  not wrap them in a `Section`.

## Generated code — do not hand-edit

`src/api/proto-http/*` is generated by `buf generate` from the `proto/` git submodule (`grbpwr-proto`). To change API shapes, update the proto submodule and run `make proto`; never edit the generated files directly.

## Gotchas

- `src/api/api.ts` logs raw backend responses via `console.log('[BE] ...')`. That's intentional debug noise, not a bug to "fix" unless asked.
- `src/context/index.tsx` is an empty reducer scaffold (no real actions yet). Don't assume it holds app state.
- Cropping remote images can hit CORS; dev uses the `media-proxy` Vite middleware (`vite.config.ts`) and production uses `api/media-proxy.js` (Vercel function). Keep both in sync if you touch proxy behavior.
- Checkouts of this repo sit on different branches (primary clone, `-beta-deploy`, `-wt-*` worktrees). Confirm the branch before committing.

## Docs

Deeper architecture notes live in `docs/` (e.g. `docs/analytics-dashboard.md` covers the analytics dashboard's data flow, period/compare semantics, and metric sources).
