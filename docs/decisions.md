# Decisions

Assumptions and choices that are not spelled out in the build brief. Newest at the bottom of each
milestone.

## Milestone 0

### GitHub Actions instead of GitLab CI

The repo lives on GitHub, so CI is GitHub Actions (`.github/workflows/ci.yml`) rather than the
`.gitlab-ci.yml` the brief describes. Confirmed with Christian on 2026-10-18. The Milestone 14
deploy and installer jobs will also be GitHub Actions.

### Node 22.23.3

The brief specifies Node 22. Pinned in `.nvmrc`, `engines` (`>=22.12.0 <23`) and enforced with
`engine-strict=true` in `.npmrc`. Node 24 was considered and declined.

### TypeScript 6.0.3, not 7

TypeScript 7.0 is out, but typescript-eslint 8.71 supports only `>=4.8.4 <6.1.0`. We stay on 6.0.x
until typescript-eslint supports 7.

### Version policy

Exact versions everywhere (`save-exact=true`). At the time of choosing, each package was the newest
stable release that was at least a week old, so we never pin a release from the last few days.
pnpm stays on 10.x rather than 12.x (12.0 shipped in August 2026).

### Internal packages are consumed as TypeScript source

`@steward/*` packages export `./src/index.ts` directly; there is no build step per package. Next.js
compiles them through `transpilePackages`, `tsx` runs them in dev, and the API's production bundle
(`apps/api/build.mjs`, esbuild) inlines them while leaving npm dependencies external.

### Unit and end-to-end tests are separate commands

`pnpm test` runs Vitest only, so it is fast and needs no browser. Playwright runs with
`pnpm test:e2e`. CI adds the end-to-end job from Milestone 2, when there are screens to test.

### Web environment is validated when `next dev` or `next build` starts

`apps/web/next.config.ts` validates `NEXT_PUBLIC_API_URL` in the dev and build phases. `next typegen`
(used by `pnpm typecheck`) runs in the build phase too but bakes nothing in, so it is skipped by
checking `process.argv`. `NEXT_PUBLIC_API_URL` is inlined at build time, so the web and desktop
builds each need it set when they are built.

### Data-access lint rule

In `apps/web/src`, ESLint forbids importing `hono`, `hono/client`, `postgres`, `drizzle-orm`,
`@electric-sql/pglite`, `@steward/db` and common HTTP clients, and forbids `fetch`,
`window.fetch`, `globalThis.fetch` and `XMLHttpRequest`. Screens go through `@steward/data`.

### API request logs record the path only

The request logger records method, path, status and duration. Query strings are left out because
they can carry search terms and other user input. Pino also redacts password, token,
authorization, cookie and GCash reference fields as a safety net.

### CORS

The API allows only `WEB_ORIGIN`, with credentials (needed for session cookies in Milestone 5). The
Electron app will talk to the API from the main process, so it does not depend on CORS.

### Money helpers in Milestone 0

`formatPeso`, `parsePesoInput`, `sumCentavos` and the centavo guards only. Rounding helpers belong
with the totals algorithm in Milestone 3, where float edge cases such as `11200 / 1.12` need a
deliberate design rather than a quick `Math.round`.

### Local Postgres

`docker-compose.dev.yml` runs `postgres:16.15-alpine`, bound to `127.0.0.1` only, with the
development-only credentials `steward` / `steward`.

## Milestone 1

### Where the shell lives

`packages/ui` holds the design system: tokens (`src/styles/globals.css`), the shadcn components and
the small custom ones (Badge variants, StatusBadge, SyncPill, StatusDot, Kbd, Stepper, Logo,
EmptyState). The app shell (sidebar, header, branch switcher, command menu) lives in
`apps/web/src/components/shell` because it depends on Next.js routing and app state. The desktop
app loads the same web build, so nothing is duplicated.

### shadcn components are restyled to the mockup

Generated components were edited to the mockup's measurements (button heights 36/32/26/44px,
badges 22px, dialogs and the inset panel 14px radius, menus 10px). Where the brief's radius list
(dialogs 12px) and the mockup (14px) disagree on looks, the mockup wins.

The shadcn CLI 4.21 rewrote imports to a new `cn` npm package (first published in October 2026).
That is too new for the "boring libraries" rule, so components import `cn` from
`@steward/ui/lib/utils` (clsx and tailwind-merge) instead. The CLI also pinned recharts 3.8.0; we
use 3.10.1 and fixed the chart component's types to pass strict linting.

### Text line-height follows the mockup

The mockup gives everything line-height 1.5. Tailwind's `text-xs/sm/base/lg` carry their own
line-heights, which moved text by 1 to 2px, so the theme sets those to 1.5. With that, the
shell's element boxes match the mockup's to the pixel at 1280px.

### Muted text is two steps darker than the mockup

The mockup's `#71717a` muted text on the `#f4f4f5` muted background is 4.4:1, below WCAG AA (4.5:1),
which the brief requires. Light `--muted-foreground` is `#6f6f78` (4.53:1), which is not visibly
different. Dark mode already passes.

### Usernames use Geist Mono

The mockup shows the username in the account menu in Geist. The brief says usernames use Geist
Mono, so the brief wins there. The "System theme" item uses the mockup's panel icon.

### Theme and sidebar persistence without a flash

- Theme: next-themes with `attribute="data-theme"`, `defaultTheme="system"`, stored under
  `steward:theme`.
- Collapsed sidebar: stored under `steward:sidebar-collapsed`. A one-line inline script at the top
  of `<body>` sets `<html data-sidebar="collapsed">` while the HTML is parsed, and the rail's
  collapsed styles are pure CSS keyed on that attribute (`sidebar-collapsed:` variant). React reads
  the same attribute through `useSyncExternalStore`, so there is no hydration mismatch.
  `next/script` with `beforeInteractive` was tried and rejected: it runs when Next boots, after
  first paint.
- Both are inline scripts. Milestone 13's strict CSP needs their hashes (a static export cannot
  use nonces).

### Permissions map is in packages/domain now

`can(role, action)` in `packages/domain/src/permissions.ts` is the single role-to-actions map that
the brief asks for. The shell already uses it for navigation, the branch switcher and the command
menu. Milestone 5 adds resource and branch scoping and uses it in every API service. Add stock is
admin-only, matching both the mockup and the brief's role table.

### Temporary development tools, pulled forward from Milestone 2

Testing "Ctrl/Cmd+K works for admins only" needs a staff session, so the "Preview as" switch (in
the account menu) arrived in this milestone. It shows only when `NEXT_PUBLIC_DEV_ROLE_SWITCHER=true`.
The same flag shows the fake offline toggle (sync card button, clickable sync pill and command).
Without the flag the sync pill is display-only.

The session is a Zustand store that starts as the demo admin and resets on reload. `/sign-in` is a
temporary page with the two demo accounts, so "Sign out" has somewhere to go. The real sign-in
screen comes in Milestone 2 and real authentication in Milestone 5.

### Static fixtures until Milestone 2

Branches, demo users and the pending-request counts (5 for admins, 2 for NCCC Market staff) live in
`apps/web/src/fixtures`. Milestone 2 moves them behind the DataClient interface.

### Responsive breakpoints

The mockup's breakpoints are used as-is with arbitrary variants: `max-[1180px]` (narrower search),
`max-[860px]` (sidebar becomes a sheet, inset panel goes edge to edge, header text hides) and
`max-[560px]` (smaller page title).

### End-to-end tests guard against console errors

Every Playwright test fails if the page logs a console error or throws (`apps/web/e2e/fixtures.ts`).
Tests open pages through `gotoApp`, which waits until the app has hydrated. Axe checks
(WCAG 2.1 AA) run on the shell in both themes and with the command menu and mobile menu open. CI
now runs the end-to-end tests in a separate job.

## Milestone 3 (built before Milestone 2)

### Order

The domain core was built before the Milestone 2 screens so the static front end could use the
real totals, FIFO and stock rules from the start instead of throwaway versions. Each milestone
is still its own commit and pull request.

### Exact money math

Totals use exact fractions over `bigint` (`packages/domain/src/rational.ts`) and round half-up to
the centavo only where the brief's algorithm says "round". Floating point never touches a peso
amount, except inside discount formulas, which are converted once to thousandths of a centavo
before rounding so float noise cannot tip a half-centavo.

### Stored units

- VAT rate: basis points (`1200` is 12%).
- Percent discounts: basis points (`2000` is 20%). Fixed and per-item discounts: centavos.
- Money everywhere: integer centavos.

### Expiry day counts as expired

A batch is expired on its expiry date, matching the mockup (0 days left shows "Expired"). Expired
batches stay visible but are never sold or transferred.

### Offline oversell

`allocateFifoAllowingOversell` charges the shortfall to the batch the counter would have sold
from next, taking it below zero, and reports it so the server can flag the sale.

### Phone numbers

Stored normalized as digits: mobile `09XXXXXXXXX`, landline with area code (`0822345678`,
`0281234567`). `+63` and `63` prefixes are accepted.

### Branch hours

Closing time is exclusive: a branch that closes at 20:00 shows Closed at 8:00 PM.

### Formula sample

The live preview and formula validation use the mockup's sample sale: ₱1,000.00, 10 items, as
two lines of 4 and 6 items at ₱100.00.

## Milestone 2

### DataClient and the fake client

- `packages/data` defines the `DataClient` interface and the view models screens receive. Screens
  use it through TanStack Query hooks in `apps/web/src/data/hooks.ts`.
- `FakeDataClient` (`packages/data/src/fake`) runs in memory over the mockup dataset, using the
  real domain rules (totals, FIFO, stock status, allocation, request transitions). It also makes
  the same role and branch checks the API will make, so permission behavior can be tested before
  the backend exists. It adds about 150ms of latency in the browser so loading states show.
- The dataset generator lives in `packages/db/src/seed/mockup-dataset.ts` (pure TypeScript), so
  the Milestone 4 seed loads the same data.

### The mockup dataset

- The mockup's catalog, batch numbers, quantities and expiry dates come out exactly as in the
  mockup: its seeded random sequence is reproduced, and the expiry dates are relative to today.
- The mockup generated sales and stock requests at random without touching stock. Here they are
  generated around the stock and kept consistent with it. Each batch's receipt movement equals
  its final quantity, plus units sold, plus transfers out, minus transfers in. Sales fall within
  store hours, their totals come from `computeTotals`, and receipt numbers are gapless per counter.
- Fulfilled seed requests only move products whose batch numbers exist at both central and the
  branch, so transfers keep batch numbers without changing the mockup's final quantities.
- Demo passwords are the mockup's (`admin` / `admin`, `cashier1` / `pos`, others `pos`). They are
  shorter than the 6-character rule because they are seed data, never created through the app.

### Sign-in and session in the static front end

The real sign-in screen from the mockup is in place. The fake client keeps the signed-in user's
id in `sessionStorage`. The demo account buttons on the sign-in page, and "Preview as" in the
account menu, show only with `NEXT_PUBLIC_DEV_ROLE_SWITCHER=true`. "Preview as" signs in through
the DataClient with the demo account, so it keeps working against the real API in development.

The art panel on the sign-in page shows the four branches as "Synced", without the mockup's
revenue figures, because nothing about sales should show before sign-in.

### Forms

Forms keep what people typed (strings) in react-hook-form. On submit they convert the values
(pesos to centavos, percent to basis points) and validate with the shared Zod schema from
`packages/domain`. Schema errors and server field errors map back onto form fields. This keeps
one set of rules and messages for the forms, the fake client, the API and the desktop.

### Selects

Filter and form selects use a native `<select>` styled like the mockup (`NativeSelect` in
`packages/ui`) instead of the Radix select. They match the mockup exactly, and native selects
behave predictably with keyboards on counter PCs and on phones.

### Printing

`apps/web/src/lib/print.ts` prints receipts through a hidden iframe with its own `@page` size
(58mm or 80mm, remembered per browser, 80mm by default), so only the receipt prints.

### Working branch

Admins choose a working branch in the sidebar. It is kept in `sessionStorage` and used by the
POS and inventory. Staff always work at their assigned branch, and the data layer refuses other
branches regardless of what the screen asks for.

### Dashboard comparisons

KPI deltas compare the current period so far with the same elapsed span of the previous period,
for example today until 10 AM against yesterday until 10 AM. The trend chart shows the whole
previous period. Today's chart runs from 7 AM to 9 PM; sales outside those hours count toward
the first or last hour.

### Product search

Search matches when every word typed appears in the brand, generic name, SKU or strength, so
"biogesic 500" finds Biogesic 500mg.

## Milestone 4

### One schema, two engines

`packages/db/src/schema` is the only schema. `drizzle-kit generate` writes SQL migrations to
`packages/db/drizzle`, and the same files run on PostgreSQL (`migratePostgresDb`) and PGlite
(`migratePgliteDb`). Query modules take the `Db` type, which is satisfied by both drivers and by
transactions.

### What the database enforces

- `server_version`: a trigger on every synced table stamps it from one sequence on each insert
  and update, and bumps `updated_at` on update. While a desktop applies a pull it sets
  `steward.applying_pull = 'on'` for that transaction, and the trigger keeps the server's value.
- Append-only tables reject updates and deletes: `stock_movements`, `sales`, `sale_lines`,
  `sale_line_batches`, `stock_request_events` and `audit_log`. Mistakes are fixed with new rows.
- Check constraints repeat the key domain rules: price above zero, a GCash reference of 13 digits,
  cash received at least the total, line total equal to quantity times price, closing time after
  opening, at least one open day, PRC license for pharmacists.
- At most one live central branch, by a partial unique index.
- On hand comes from views (`batch_on_hand`, `product_on_hand`) over the ledger. No stored
  quantities.

### Better Auth tables

`users`, `sessions`, `accounts` and `verifications` follow Better Auth's model. `users.full_name`
is Better Auth's `name`. Its `email` is required and unique, but staff often have no email, so it
holds an internal placeholder (`<id>@users.invalid`, a reserved domain) and the real address is
in `contact_email`. Password hashes are argon2id (`packages/db/src/password.ts`) in
`accounts.password`; devices sync them for offline sign-in.

### Counters

Receipt and request numbers come from counter rows updated inside the writing transaction
(`INSERT … ON CONFLICT DO UPDATE … RETURNING`). Concurrent sales wait on the row lock, and a
rolled-back sale returns its number, so sequences have no gaps.

### Desktop-only tables

`outbox`, `sync_state`, `local_counters` and `sign_in_attempts` are part of the shared migrations
so both engines have one schema. The server never writes to them.

### Real database tests

Database tests run on PGlite every time, and also on PostgreSQL when `TEST_DATABASE_URL` is set.
CI sets it with a `postgres:16` service. Locally, start the compose database and run, for example:
`TEST_DATABASE_URL=postgres://steward:steward@localhost:5432/postgres pnpm test`. Each test file gets
its own throwaway database.

### Local port

`docker-compose.dev.yml` reads `POSTGRES_PORT` (default 5432), for machines that already run a
Postgres on 5432.

## Milestone 5

### API shape

- Routes are thin. They validate input with the shared Zod schemas (`http/validate.ts`), build a
  `ServiceContext` and call a service in `apps/api/src/services`. Services do every permission
  check.
- Errors leave the API as `{ error: { code, message, fields } }`. `code` is the same set the
  DataClient uses, and `message` is written for people.
- The route chain is typed end to end. `@steward/data`'s `RemoteClient` uses the Hono RPC client
  with `AppType` from `@steward/api/app-type` (a type-only dependency).
- View models moved from `@steward/data` to `@steward/domain/view-models`, so the API can return
  them without depending on `@steward/data`. Turborepo rejects circular workspace dependencies.

### Authentication

- Better Auth with the username plugin, the Drizzle adapter on our own tables, database sessions
  (12 hours, refreshed hourly) and argon2id through its `password.hash` and `password.verify`
  hooks. Sign-up is disabled: admins create accounts.
- Better Auth's HTTP handler is never mounted. Our routes (`GET`/`POST`/`DELETE /session`) call
  its server API so they can add what it does not do on its own:
  - a 5-minute lockout after 5 failed tries for a username (`sign_in_attempts`), plus an
    in-memory per-IP limit on the sign-in route;
  - refusing inactive accounts with the mockup's message (shown only after a correct password,
    so the response does not reveal whether a username exists).
- Every request re-reads the user from the database, so deactivating or deleting someone takes
  effect immediately. Deactivation also deletes their sessions (Milestone 6).
- Cookies: `steward.session_token`, httpOnly, SameSite=Lax, Secure in production.

### CSRF

Cookie-authenticated writes must come from `WEB_ORIGIN` (the `Origin` header), on top of
SameSite=Lax. Device requests use a bearer token and are exempt.

### Permissions

`authorize(actor, action, { branchId })` (`apps/api/src/auth/permissions.ts`) combines the role
map from `@steward/domain` with branch scoping. For list queries, `scopedBranch` ignores the
branch a staff user asks for and always uses theirs. Tests call the API directly to prove staff
cannot read another branch's stock, sales or requests, or open admin data.

### Web data source

`NEXT_PUBLIC_DATA_SOURCE` picks the client: `remote` (default, the API) or `fake` (in-memory demo
data, used by the fast UI test suite and for working without a backend).
`NEXT_PUBLIC_DEPLOY_ENV=production` makes the build fail if the dev role switcher or fake data
is turned on, which keeps the role switcher out of production builds. In production the web
reaches the API at `/api` on the same site, through Caddy.

### Writes during the milestone stack

`RemoteClient` write methods are connected as their routes land in Milestones 6 to 9 (settings in 6). Until then
they return a clear "not connected yet" error.

## Milestone 6

### Settings are online-only

Settings, branches, staff accounts, discounts and devices change only through the API, and only
for admins (`settings.manage`, checked in every service). Desktops treat them as read-only data
that sync pulls; the server always wins. Each change writes an `audit_log` row in the same
transaction. Audit rows never hold passwords, enrollment codes or tokens; staff rows record
whether a phone or email exists rather than the values.

### Deletes are soft

Branches, staff accounts and discounts get `deleted_at` instead of being removed, because past
sales, stock movements and requests point at them. Removing a branch moves its staff to central
and revokes its devices. Central can't be removed. Deleting a staff account also deactivates it
and ends its sessions.

### Snapshots keep history stable

Sales store their own discount label, amounts and pricing settings, so editing a discount or the
VAT rate changes only future sales. A test edits the Senior / PWD rule and checks an old receipt
is unchanged.

### Ending sessions

Deactivating an account, deleting it, or setting a new password deletes all of that person's
sessions, so they are signed out on their next request. Admin accounts can't be deactivated or
deleted from Settings, and admins can't deactivate themselves.

### Device enrollment

Adding a device returns an 8-character code from an alphabet without look-alike characters (no 0,
O, 1 or I). Only its SHA-256 hash is stored. The code expires after 15 minutes and works once.
An admin can issue a new code until the device is revoked. Receipt series are unique per branch
among devices that aren't revoked. Revoking a device clears its token hash and pending code. A
revoked device is never re-enabled; add it again as a new device.

### Schemas accept their own output

Forms validate with the domain schemas and send the parsed value; the API validates it again.
Optional text fields (email, address, PRC license) accept `null` as well as blank text, so a
parsed value parses again unchanged. A domain test covers this.

## Milestone 7

### Add stock on the server

`POST /stock/receive` (`apps/api/src/services/stock-service.ts`) is admin-only
(`inventory.add_stock`), matching the mockup, where staff have no Add stock button. In one
transaction it creates the product (for a new product), creates the batch or finds the existing
one for the same product, branch and batch number, and writes one `receive` movement. Batch
numbers are stored in upper case, so `ab-12` tops up `AB-12`.

- **Expiry** is checked against today in Manila on the server. The `today` field the client
  sends is only used for the client's own check.
- **Same batch number, different expiry** is refused and names the expiry on file, because it
  almost always means a typo.
- **Retries**: the client generates the receipt id once per opened sheet. A repeated id returns
  the original result and receives nothing. The same id will make `stock.receive` idempotent for
  sync in Milestone 12.
- **Concurrency**: the batch insert uses `ON CONFLICT DO NOTHING` and then locks the row, so two
  receipts of the same new batch at once both count. New SKUs (`PS-1001` onwards) are issued under
  a transaction-scoped advisory lock.
- New products get an audit row. Stock movements are their own record, so receipts are not
  audited twice.

### Expired stock

On hand in Inventory includes expired batches, because the stock is physically there and needs
pulling. Expired batches are flagged in the batch rows and never marked "sells next". POS sellable
counts only unexpired batches. A batch counts as expired on its expiry date.

## Milestone 8

### Selling online

`POST /sales` (`apps/api/src/services/sale-service.ts`) re-checks everything with
`packages/domain` in one transaction:

- current prices, the discount and the settings;
- sellable stock, FIFO and never expired;
- payment: cash covers the total, or a GCash reference with 13 digits.

The counter sends the total it showed (`expectedTotalCentavos`). If prices changed since the cart
was built, the sale is refused, never silently repriced. Lines for the same product are merged.

### Last unit, two cashiers

A sale first locks the batch rows for its products at the branch, in id order, then reads on hand
from the ledger. A second sale of the same product waits and then sees the first one's movements,
so it gets "… just sold out" instead of overselling. Locking in id order means two sales with
overlapping products can't deadlock. Fulfilling stock requests will use the same helper
(`lockBatchStock`). The concurrency test runs on real PostgreSQL in CI.

### Receipt numbers on the web

Web sales take the next number from the `web:<branch id>` counter, inside the sale's transaction,
so the sequence has no gaps (a failed sale gives its number back). Series W, for example
OR-NCC-W-000001. Retrying a sale with the same id returns the original receipt. The discount label
stored on the sale (`saleDiscountLabel`) is in the domain package, shared with the demo client.

### Full-stack end-to-end tests

`apps/api/src/e2e-server.ts` starts the API on a fresh in-memory PGlite database seeded with the
mockup data. `apps/web/playwright.fullstack.config.ts` builds the web in remote mode against it and
covers a cash sale, a GCash sale, a Senior / PWD sale and the admin's sales activity. CI runs this
suite after the UI suite. The e2e server refuses to start with `NODE_ENV=production`, and it isn't
part of the API bundle.
