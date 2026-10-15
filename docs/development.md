# Development

## Prerequisites

- **Node.js** 22.22.2+ (see `.nvmrc`; `.npmrc` sets `engine-strict=true`)
- **npm** (workspaces)
- **Go** 1.21+ (it downloads the exact version in `services/api/go.mod`); CDK synth and the infra tests compile the Go Lambdas
- **Docker** for DynamoDB Local (`npm run local:dev`, `e2e:local`, `e2e:browser`)

```bash
nvm install   # reads .nvmrc
nvm use
npm ci

# Only for the Expo app: it sits outside the root workspaces with its own
# lockfile so web / API / infra work never installs React Native.
npm ci --prefix apps/mobile
```

## Claude Code cloud sessions

`.claude/hooks/session-start.sh` runs at the start of each cloud session (it
exits immediately on a local machine). It installs the Node version from
`.nvmrc` with nvm and puts it first on `PATH` for the session, installs root
dependencies (`npm install`, without Playwright browser downloads) and
`apps/mobile` dependencies (`npm ci`), downloads the Go toolchain and modules
for `services/api/` and its tools, installs `rsync` if it is missing (the
scripts tests and `seed-shell` need it), starts the Docker daemon (logging to
`/var/log/dockerd.log`) and sets `E2E_CHROMIUM_EXECUTABLE` to the image's
Chromium at `/opt/pw-browsers/chromium`. Lint, typecheck, `npm test`, the Go
gates, the mobile tests, `npm run local:dev`, `test:integration` and the
Chromium e2e projects work without further setup; the session has no WebKit
([local-e2e.md](./local-e2e.md#browser-tests-playwright)).

Linear is reached through the claude.ai Linear connector, which must be
enabled for the project or session; the repository holds no Linear
credentials.

## Day-to-day: full local CMS

```bash
npm run local:dev
```

Starts DynamoDB Local (Compose project `gagnechris`), bootstraps `gagnechris-local`, seeds a publisher shell under `.local-site/`, runs:

| Process                                     | Port (default) |
| ------------------------------------------- | -------------- |
| Local API (`scripts/local/api.ts`)          | `8787`         |
| Static publisher origin                     | `4177`         |
| Vite, public site                           | `5173`         |
| Vite, admin app (`VITE_AUTH_MODE=local`)    | `5174`         |
| Vite, Notebook app (`VITE_AUTH_MODE=local`) | `5175`         |

The local API is the Go API (`services/api/cmd/api`). `scripts/local/api.ts` builds it once (no watch: restart `local:dev` to pick up Go changes; `GO_API_BIN` names a prebuilt binary instead) and runs it on a private port with `API_CLAIMS_MODE=local`, which turns a local `Bearer` token into the route's ID-token claims. A small front server on `8787` (`scripts/local/site-hooks.ts`) runs the local stand-ins for the site bucket's media CORS rule and the publisher's stream trigger around it, so a publish rebuilds the local site before the response returns.

Open the public site at [http://localhost:5173](http://localhost:5173), the CMS at [http://localhost:5174](http://localhost:5174) and Notebook at [http://localhost:5175](http://localhost:5175). Each Vite server proxies `/api` → local API; the public one also proxies `/__site` → the static origin and the admin one `/media` (mirrors production CloudFront routing). Local media and Notebook image upload URLs point at the local API, which answers the browser's CORS preflight for them the way the buckets' CORS rules do in production. Fake local sign-in never uses Cognito or prod AWS.

The public site has no sign-in, admin or Notebook routes: on `:5173`, `/admin` and `/auth/callback` render the 404 page. The static origin (`:4177`) runs the apex viewer-request function, so there they 301 to `https://admin.gagnechris.com` / `https://notebook.gagnechris.com` as in production.

**Notebook PWA:** `apps/web/public-notebook/` holds `manifest.json` (`id`, `start_url` and `scope` all `/`), `/icons/*` and the Notebook AASA, so iPhone Add to Home Screen on `notebook.gagnechris.com` opens Today in standalone mode. There is no offline cache.

More detail: [local-e2e.md](./local-e2e.md).

## Vite-only

```bash
npm run dev                 # public :5173, admin :5174, Notebook :5175; API → local (default)
npm run dev -- notebook     # just the named app(s)
npm run dev:prod-api        # API → https://gagnechris.com (prints PRODUCTION banner)
```

`apps/web` is one workspace with three Vite targets picked by `WEB_APP=public|admin|notebook` (`apps/web/scripts/webApps.ts`): `index.html` → `dist/`, `admin.html` → `dist-admin/`, `notebook.html` → `dist-notebook/`, each with its own `publicDir`. Code lives in `src/` (public pages), `src/admin/`, `src/notebook/` and `src/workspace/` (sign-in, query provider, editors and chrome both signed-in apps share). ESLint zones stop public code importing the other three and stop the two apps importing each other.

Prefer `local:dev` unless you intentionally need the production API.

## Storybook

```bash
npm run storybook        # the component catalog on http://localhost:6006
npm run storybook:build  # static catalog → apps/storybook/storybook-static (CI)
```

The catalog from `main` is live at <https://components.gagnechris.com> (not
indexed); `infra/RUNBOOK.md` covers its host and deploy.

`apps/storybook` catalogs the shared UI (`packages/ui`), the Admin, Notebook and
workspace components in `apps/web` and the public page bodies in
`packages/public-ui`. Stories live in `apps/storybook/src/<area>/` and import
`apps/web` modules through the `@web/*` alias. The preview loads the token CSS,
the shared UI and workspace styles and the Notebook fonts; public stories import
the page CSS the public site loads. Every story wraps a `MemoryRouter`, uses
sample data and never calls the API (ESLint bans the API client, React Query,
app-core and auth imports there). Each component's docs page names its iOS
counterpart through `catalog()` in `apps/storybook/src/catalog.ts`. A new
component gets a story in the same PR.

## Quality gates

`npm run verify` runs the checks below that the branch's changes can affect,
against `origin/main`: Prettier and ESLint on the changed files, typecheck and
unit tests for each workspace with a changed, deleted or renamed file and every
workspace that depends on it, the generated-file drift checks whose inputs
changed, tsconfig coverage and case collisions when files are added, and Go lint
and test when Go changed. Changes under `.github/` or `.githooks/` run the
`@gagnechris/scripts` tests. A change to the root `package.json`, lockfile,
`tsconfig.base.json`, ESLint config, `.nvmrc` or `.npmrc` checks every
workspace. The two code generators (`openapi:check`, `go:generate:check`) and
Go lint and test run one after another, since they write and read the same
generated files; everything else runs in parallel. `npm run verify:all` runs the full
set. `npm install` points `core.hooksPath` at `.githooks`, whose `pre-push`
runs `npm run verify`; `git push --no-verify` skips it. The build, web shell,
RN bundle, Storybook build, CDK synth, e2e and integration checks stay CI-only (run them
yourself when the change touches them).

```bash
npm test              # all root workspaces with a test script (web, shared, api-client, tokens, data, app-core, public-ui, ops, api-tests unit, publisher, infra, scripts: the repo-wide tests in scripts/test); mobile: npm test --prefix apps/mobile
npm run test:integration -w @gagnechris/api-tests   # the black-box HTTP suite against the Go API on DynamoDB Local (Docker); test:http is the same
npm run typecheck     # all workspaces with a typecheck script
npm run lint          # ESLint for every workspace
npm run format:check  # Prettier check (CI)
npm run go:lint       # golangci-lint on services/api/ (gofmt, goimports, vet, staticcheck, revive...; config in services/api/.golangci.yml) (CI)
npm run go:test       # go test ./... in services/api/; failures DynamoDB Local never produces (cancellation reasons, throttles, UnprocessedKeys) are faked through data.Client with internal/data/datatest (CI)
npm run go:generate:check # services/api/internal/contract/contract.json and services/api/internal/apitypes drift from packages/shared, packages/data and the OpenAPI file (CI)
npm run go:fmt        # gofmt + goimports on services/api/
npm run openapi:check # OpenAPI + generated client drift; npm run openapi also regenerates the Go types (CI)
npm run tokens:check  # design token CSS drift (CI)
npm run publish-surface:check # Option B pages, KVS keys, publish routes and publisher-owned S3 keys from publisher targets (CI)
npm run format        # Prettier write
npm run build         # tsc -b + all three Vite targets → apps/web/dist, dist-admin, dist-notebook
npm run storybook:build # the static Storybook catalog; a story that fails to build fails CI
npm run check:web-shells # after build: GA on the public shell only when GA_MEASUREMENT_ID is set, no inline script and only the allowed entry assets there, entry JS within budget and without zod, self-hosted fonts named for their content; demos only in lazy chunks; app shells load bundled scripts only (CI)
npm run check:rn-bundles            # every package and subpath mobile imports bundles without Node-only or banned imports, and both lockfiles agree on their runtime deps (CI)
npm run check:platform-neutral-lint # the ESLint bans in platform-neutral packages still fire (CI)
npm run check:tsconfig-coverage     # each workspace's typecheck covers every .ts file in it (CI)
npm run check:case-collisions       # no tracked paths or module stems that differ only by case (CI)
npm run e2e:local     # publish lifecycle smoke (Playwright api project, own stack)
npm run e2e:browser   # Playwright (Chromium + WebKit) against its own local stack
```

The root scripts skip `apps/mobile`; its gates (including a real Metro bundle
that is executed, not just built) run with `--prefix apps/mobile`. See
[mobile.md](./mobile.md).

## Environment variables

### Vite (`apps/web`)

| Variable                                    | Notes                                                                                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_COGNITO_USER_POOL_ID`                 | Admin and Notebook builds: required for real Cognito auth                                                                                                                                                                                                                             |
| `VITE_COGNITO_ADMIN_CLIENT_ID`              | Admin build: the `admin-web` client; locally the `dev-local` client (SSM `cognito-dev-client-id`), whose tokens the prod API rejects                                                                                                                                                  |
| `VITE_COGNITO_NOTEBOOK_CLIENT_ID`           | Notebook build: the `notebook-web` client; locally `dev-local` as above                                                                                                                                                                                                               |
| `VITE_COGNITO_AUTH_DOMAIN`                  | Admin and Notebook builds: Cognito domain host                                                                                                                                                                                                                                        |
| `WEB_APP`                                   | `public` (default), `admin` or `notebook`: which app `vite` serves or builds                                                                                                                                                                                                          |
| `VITE_API_BASE_URL`                         | Optional; default same-origin                                                                                                                                                                                                                                                         |
| `VITE_API_TARGET`                           | Dev only: set `prod` to proxy `/api` to production                                                                                                                                                                                                                                    |
| `VITE_LOCAL_API_ORIGIN`                     | Dev only: local API origin (set by `scripts/local/env.sh`)                                                                                                                                                                                                                            |
| `VITE_LOCAL_SITE_ORIGIN`                    | Dev only: publisher static origin for `/__site` (publisher pages). Builds ignore it and fetch same-origin paths, as in prod                                                                                                                                                           |
| `GA_MEASUREMENT_ID`                         | Public build only, read from the process environment (not `.env` files): a GA4 measurement ID turns on Google Analytics. `scripts/deploy-web.sh` sets it; unset, the build loads no GA                                                                                                |
| `VITE_AUTH_MODE`                            | Dev only: `local` fakes sign-in; **forbidden in production builds**                                                                                                                                                                                                                   |
| `VITE_PUBLIC_SITE_ORIGIN`                   | Origin the admin app links public pages to (View live, preview links; new tab, `rel="noopener noreferrer"`) and loads Home and Resume preview images from. Default: `https://gagnechris.com` in builds, `http://localhost:5173` in dev; browser e2e sets the local site               |
| `VITE_ADMIN_ORIGIN`, `VITE_NOTEBOOK_ORIGIN` | Where the admin and Notebook apps link each other under Your apps (shown only to users in the other app's group). Default: `https://admin.gagnechris.com` and `https://notebook.gagnechris.com` in builds, `http://localhost:5174` and `:5175` in dev; browser e2e sets its own ports |

### Local stack (`scripts/local/env.sh`)

| Variable                             | Default / notes                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `DYNAMODB_LOCAL_HOST_PORT`           | `8000` (host port Compose publishes)                                             |
| `AWS_ENDPOINT_URL_DYNAMODB`          | `http://127.0.0.1:${DYNAMODB_LOCAL_HOST_PORT}`                                   |
| `DATA_TABLE_NAME`                    | `gagnechris-local` (refuses `gagnechris-prod`)                                   |
| `SITE_BUCKET_NAME`                   | Repo `.local-site/` filesystem “bucket”                                          |
| `NOTEBOOK_MEDIA_BUCKET_NAME`         | Repo `.local-notebook-media/`: stand-in for the private Notebook images bucket   |
| `LOCAL_API_PORT` / `LOCAL_SITE_PORT` | `8787` / `4177`                                                                  |
| `COMPOSE_PROJECT_NAME`               | `gagnechris` (shared DynamoDB Local across worktrees)                            |
| `USER_DIRECTORY`                     | `memory`: in-memory stand-in for the Cognito user pool behind `/api/admin/users` |
| `LOCAL_KVS_FILE`                     | Repo `.local-kvs.json`: stand-in for the CloudFront KeyValueStore slug allowlist |

Fake AWS keys are set; `AWS_PROFILE` is unset so the local stack cannot accidentally use SSO credentials. The local API never calls SES: outside Lambda the Go API logs the mail it sends (contact form, resume download) and appends it as JSON lines to `LOCAL_OUTBOX_FILE` when that is set (`contact.Outbox` in `services/api/internal/contact`).

`scripts/local/bootstrap-table.ts` and the HTTP suite's ephemeral tables both create the table from `appTableCreateInput` in `@gagnechris/data` (the `APP_TABLE` keys, GSIs with the same projections CDK deploys, and the stream); `http/table-schema.test.ts` checks both against `APP_TABLE` in DynamoDB Local. `scripts/local/bootstrap-table.ts` is idempotent: it adds missing GSIs and enables TTL only when `DescribeTimeToLive` says it is off, so re-running `npm run local:dev` against a running container works.

### Integration tests

`npm run test:integration -w @gagnechris/api-tests` **ignores** `DATA_TABLE_NAME`. Each file creates an ephemeral `gagnechris-it-*` table and deletes it afterward, so sourcing `env.sh` and running tests will not wipe `gagnechris-local`. Tables that do not start with `gagnechris-it-` are refused.

The `@gagnechris/api-tests` workspace (`services/api/test`) has two Vitest projects:

- `http` (`services/api/test/http`): black-box tests of the Go API. The global setup (`support/global-setup.ts`) builds `services/api/cmd/api` once, unless `GO_API_BIN` already names a binary. Each file creates its table, starts the binary on a free port with `API_CLAIMS_MODE=test` (`startApi` in `http/support/api.ts`, usually through `useApi` in `harness.ts`) and sends plain HTTP requests, through `apiCalls` in `http/support/call.ts`, which sets the claims, `If-Match`, a path prefix and the default user per file; it may seed and read rows in the table. The tests send the authorizer's claims as JSON in `X-Test-Claims` (`http/support/claims.ts` builds them), and the server passes them to the handler only on protected routes, as API Gateway's JWT authorizer does. `request` parses every 2xx body with the response schema `packages/shared/src/openapi.ts` registers for that route and status (`http/support/response-schemas.ts`) and throws on a mismatch or an undocumented route. After each test, `useApi` scans the table and parses every row with its entity type's schema in `ITEM_SCHEMAS` from `@gagnechris/data` (`http/support/row-schemas.ts`, which also lists the entity types that have no item schema); a test that stores a corrupt row on purpose exempts it with `h.corruptRow(key)`. The `ops-*.test.ts` files run the `@gagnechris/ops` copy-back and row migrations against a file's table, with the API serving it.
- `unit` (in `npm test`): the test table guard and the DynamoDB Local lifecycle helpers.

Integration tests always talk to `http://127.0.0.1:8001` (override with `INTEGRATION_DYNAMODB_ENDPOINT`) and ignore an inherited `AWS_ENDPOINT_URL_DYNAMODB`, so they never reuse the local-dev DynamoDB on 8000. Compose always uses project `gagnechris-ci` (`-p gagnechris-ci`), never `env.sh`'s `gagnechris`, and teardown runs only when this process started the container. A stale started-flag under `os.tmpdir()` cannot stop `gagnechris-dynamodb-1`.

### CDK / deploy

- Region: `us-east-1`
- Account from credentials / `CDK_ACCOUNT`
- `ALERTS_EMAIL` (or `-c alertsEmail=you@example.com`) is required for every synth
- Web deploy: `npm run deploy:web` (or CI on merge to `main`)

## Troubleshooting

### Port 8000 already in use

DynamoDB Local defaults to `8000`. Another process (or a previous Compose project) may own it:

```bash
docker compose -f docker-compose.local.yml ps
lsof -iTCP:8000 -sTCP:LISTEN
```

Use the stable Compose project name (`gagnechris`) so worktrees share one Local instance, or stop the conflicting container/process. Override with `DYNAMODB_LOCAL_HOST_PORT` / `AWS_ENDPOINT_URL_DYNAMODB` / Compose port mapping only if you need a second instance.

API integration (in CI and locally) uses Compose project `gagnechris-ci` on host port **8001** only: `docker-compose.ci.yml` replaces the base ports with `ports: !override` (Compose 2.24.4+), so it never also binds **8000** and cannot block `npm run local:dev`. If a `gagnechris-ci-dynamodb-1` container is holding 8000, remove it with `docker rm -f gagnechris-ci-dynamodb-1`.

### Admin or Notebook still hits Cognito locally

Ensure `npm run local:dev` (or export `VITE_AUTH_MODE=local`). A plain `npm run dev` without local env will expect real Cognito config. The public site never signs in.

### Publish succeeds but `/posts/<slug>` looks stale

Locally, confirm the static origin on `:4177` was rebuilt (the front server in `scripts/local/api.ts` triggers the publisher). Hard-refresh Vite; post HTML is loaded from `/__site/...`, not only the SPA bundle.

### Accidentally pointed at prod

`DATA_TABLE_NAME=gagnechris-prod` is refused by `scripts/local/env.sh`. `dev:prod-api` is explicit and banners loudly — avoid it for CMS writes.
