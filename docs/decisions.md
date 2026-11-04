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
