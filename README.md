# Steward Pharmacy

Point of sale and inventory for Steward Pharmacy's branches in Davao City. It runs as a web app
and as an installed Windows app on each branch counter, and counters keep selling while offline.

- The clickable mockup in [`docs/mockup/`](docs/mockup/) is the visual and behavioral spec.
- Decisions and assumptions are recorded in [`docs/decisions.md`](docs/decisions.md).

## Requirements

- Node 22 (exact version in [`.nvmrc`](.nvmrc)). With nvm: `nvm install && nvm use`.
- pnpm 10.34.6. With Corepack: `corepack enable` (it reads `packageManager` in `package.json`),
  or `npm install -g pnpm@10.34.6`.
- Docker, for the local Postgres.

The repo sets `engine-strict`, so installing with another Node major fails on purpose.

## Setup (about five minutes)

```bash
nvm install && nvm use
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:up
pnpm dev
```

- Web: http://localhost:3000 (opens as the demo admin)
- API health: http://localhost:4000/health

`apps/web/.env.example` turns on `NEXT_PUBLIC_DEV_ROLE_SWITCHER`, which adds two temporary
development tools: "Preview as" in the account menu (switch between the admin and cashier views)
and a fake offline toggle on the sync card. Leave the flag off for production builds.

Both apps validate their environment on start and exit with a list of what is missing or invalid.

## Scripts

Run from the repo root.

| Script                        | What it does                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                    | Starts the web app and the API in watch mode                                                            |
| `pnpm build`                  | Static web export to `apps/web/out`, API bundle to `apps/api/dist`                                      |
| `pnpm lint`                   | ESLint in every workspace                                                                               |
| `pnpm typecheck`              | TypeScript (strict) in every workspace                                                                  |
| `pnpm test`                   | Unit tests (Vitest)                                                                                     |
| `pnpm test:e2e`               | End-to-end tests (Playwright). First run: `pnpm --filter @steward/web exec playwright install chromium` |
| `pnpm format`                 | Prettier, writing changes                                                                               |
| `pnpm db:up` / `pnpm db:down` | Starts or stops the local Postgres 16 container                                                         |

A pre-commit hook (Husky and lint-staged) runs ESLint and Prettier on staged files.

## Layout

```
apps/
  web/        Next.js static app (all screens)
  api/        Hono server: auth, REST and sync endpoints, services
  desktop/    Electron shell (Milestone 11)
packages/
  domain/     Pure TS: money, dates, and later VAT, discounts, FIFO
  db/         Drizzle schema, migrations, seed (Milestone 4)
  data/       DataClient interface, RemoteClient, LocalClient (Milestone 2)
  sync/       Outbox and push/pull protocol types (Milestone 12)
  ui/         Design tokens and components (shadcn, restyled to the mockup)
  config/     Shared tsconfig and ESLint presets
```

Rules that keep the code honest:

- Money is always integer centavos. Pricing, VAT, discount and stock rules live only in
  `packages/domain`.
- Timestamps are stored in UTC and shown and bucketed in Asia/Manila (`packages/domain/src/dates.ts`).
- Screens in `apps/web/src` never call `fetch`, the API client or a database directly. They use
  `@steward/data`. ESLint enforces this.
- What each role may do is decided in one place: `can(role, action)` in
  `packages/domain/src/permissions.ts`.

## Data

Screens read and write through the `DataClient` interface (`packages/data`), using the TanStack
Query hooks in `apps/web/src/data/hooks.ts`. Until the API is connected (Milestone 5) the web app
uses `FakeDataClient`, an in-memory copy of the mockup's data (387 products, four branches, a
month of sales) that follows the same rules and permission checks as the real backend.

Demo accounts: `admin` / `admin` (super admin) and `cashier1` / `pos` (cashier at NCCC Market).

## Design system

The mockup in `docs/mockup` is the visual spec. Tokens live in
[`packages/ui/src/styles/globals.css`](packages/ui/src/styles/globals.css) as CSS variables with
Tailwind theme mappings (`bg-brand`, `text-muted-foreground`, `bg-success-soft` and so on). Light is
the default and dark applies under `<html data-theme="dark">`. Import components from
`@steward/ui/components/<name>`, for example `@steward/ui/components/button`.

- Brand orange is only for the logo, the active nav icon, chart series, the Charge button and
  urgent or expiring badges.
- Use `num` (tabular numbers) on every amount, count, time and date. Use `code` (Geist Mono) only
  for SKUs, batch, receipt numbers, usernames and the receipt body.
- Copy is sentence case, with no em dashes and no all-caps labels.

## CI

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs install, format check,
lint, typecheck, unit tests and build on every push to `main` and on pull requests, plus the
Playwright end-to-end tests in a separate job. End-to-end tests fail on any browser console error.
