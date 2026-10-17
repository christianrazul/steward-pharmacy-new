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
