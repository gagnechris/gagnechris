# Development

## Prerequisites

- **Node.js** 22.12+ (see `.nvmrc`; `.npmrc` sets `engine-strict=true`)
- **npm** (workspaces)
- **Docker** for DynamoDB Local (`npm run local:dev` / `e2e:local`)

```bash
nvm install   # reads .nvmrc
nvm use
npm ci

# Only for the Expo app: it sits outside the root workspaces with its own
# lockfile so web / API / infra work never installs React Native.
npm ci --prefix apps/mobile
```

## Day-to-day: full local CMS

```bash
npm run local:dev
```

Starts DynamoDB Local (Compose project `gagnechris`), bootstraps `gagnechris-local`, seeds a publisher shell under `.local-site/`, runs:

| Process                                     | Port (default) |
| ------------------------------------------- | -------------- |
| Local API (`services/api/local/server.ts`)  | `8787`         |
| Static publisher origin                     | `4177`         |
| Vite, public site                           | `5173`         |
| Vite, admin app (`VITE_AUTH_MODE=local`)    | `5174`         |
| Vite, Notebook app (`VITE_AUTH_MODE=local`) | `5175`         |

Open the public site at [http://localhost:5173](http://localhost:5173), the CMS at [http://localhost:5174](http://localhost:5174) and Notebook at [http://localhost:5175](http://localhost:5175). Each Vite server proxies `/api` → local API; the public one also proxies `/__site` → the static origin and the admin one `/media` (mirrors production CloudFront routing). Fake local sign-in never uses Cognito or prod AWS.

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

## Quality gates

```bash
npm test              # all root workspaces with a test script (web, shared, api-client, tokens, data, app-core, api unit, publisher, infra); mobile: npm test --prefix apps/mobile
npm run test:integration -w @gagnechris/api   # DynamoDB Local transaction paths (Docker)
npm run typecheck     # all workspaces with a typecheck script
npm run lint          # ESLint for every workspace
npm run format:check  # Prettier check (CI)
npm run openapi:check # OpenAPI + generated client drift (CI)
npm run tokens:check  # design token CSS drift (CI)
npm run publish-surface:check # CloudFront Option B + local publish routes from publisher targets (CI)
npm run format        # Prettier write
npm run build         # tsc -b + all three Vite targets → apps/web/dist, dist-admin, dist-notebook
npm run check:web-shells # after build: GA on the public shell only; app shells load bundled scripts only (CI)
npm run e2e:local     # one-shot CMS smoke against DynamoDB Local
npm run e2e:browser   # Playwright (Chromium + WebKit) against its own local stack
```

The root scripts skip `apps/mobile`; its gates (including a real Metro bundle
that is executed, not just built) run with `--prefix apps/mobile`. See
[mobile.md](./mobile.md).

## Environment variables

### Vite (`apps/web`)

| Variable                          | Notes                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_COGNITO_USER_POOL_ID`       | Admin and Notebook builds: required for real Cognito auth                                                                            |
| `VITE_COGNITO_ADMIN_CLIENT_ID`    | Admin build: the `admin-web` client; locally the `dev-local` client (SSM `cognito-dev-client-id`), whose tokens the prod API rejects |
| `VITE_COGNITO_NOTEBOOK_CLIENT_ID` | Notebook build: the `notebook-web` client; locally `dev-local` as above                                                              |
| `VITE_COGNITO_AUTH_DOMAIN`        | Admin and Notebook builds: Cognito domain host                                                                                       |
| `WEB_APP`                         | `public` (default), `admin` or `notebook`: which app `vite` serves or builds                                                         |
| `VITE_API_BASE_URL`               | Optional; default same-origin                                                                                                        |
| `VITE_API_TARGET`                 | Dev only: set `prod` to proxy `/api` to production                                                                                   |
| `VITE_LOCAL_API_ORIGIN`           | Dev only: local API origin (set by `scripts/local/env.sh`)                                                                           |
| `VITE_LOCAL_SITE_ORIGIN`          | Dev only: publisher static origin for `/__site` (`/posts` pages)                                                                     |
| `VITE_AUTH_MODE`                  | Dev only: `local` fakes sign-in; **forbidden in production builds**                                                                  |

### Local stack (`scripts/local/env.sh`)

| Variable                             | Default / notes                                       |
| ------------------------------------ | ----------------------------------------------------- |
| `DYNAMODB_LOCAL_HOST_PORT`           | `8000` (host port Compose publishes)                  |
| `AWS_ENDPOINT_URL_DYNAMODB`          | `http://127.0.0.1:${DYNAMODB_LOCAL_HOST_PORT}`        |
| `DATA_TABLE_NAME`                    | `gagnechris-local` (refuses `gagnechris-prod`)        |
| `SITE_BUCKET_NAME`                   | Repo `.local-site/` filesystem “bucket”               |
| `LOCAL_API_PORT` / `LOCAL_SITE_PORT` | `8787` / `4177`                                       |
| `COMPOSE_PROJECT_NAME`               | `gagnechris` (shared DynamoDB Local across worktrees) |

Fake AWS keys are set; `AWS_PROFILE` is unset so the local stack cannot accidentally use SSO credentials.

`scripts/local/bootstrap-table.ts` is idempotent: it adds missing GSIs and enables TTL only when `DescribeTimeToLive` says it is off, so re-running `npm run local:dev` or `npm run e2e:local` against a running container works.

### Integration tests

`npm run test:integration -w @gagnechris/api` **ignores** `DATA_TABLE_NAME`. Each file creates an ephemeral `gagnechris-it-*` table and deletes it afterward, so sourcing `env.sh` and running tests will not wipe `gagnechris-local`. Tables that do not start with `gagnechris-it-` are refused.

Integration tests always talk to `http://127.0.0.1:8001` (override with `INTEGRATION_DYNAMODB_ENDPOINT`) and ignore an inherited `AWS_ENDPOINT_URL_DYNAMODB`, so they never reuse the local-dev DynamoDB on 8000. Compose always uses project `gagnechris-ci` (`-p gagnechris-ci`), never `env.sh`'s `gagnechris`, and teardown runs only when this process started the container. A stale started-flag under `os.tmpdir()` cannot stop `gagnechris-dynamodb-1`.

### CDK / deploy

- Region: `us-east-1`
- Account from credentials / `CDK_ACCOUNT`
- `ALERTS_EMAIL` for Guardrails when synthesizing Guardrails-related stacks
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

Locally, confirm the static origin on `:4177` was rebuilt (API wrapper triggers publisher). Hard-refresh Vite; post HTML is loaded from `/__site/...`, not only the SPA bundle.

### Accidentally pointed at prod

`DATA_TABLE_NAME=gagnechris-prod` is refused by `scripts/local/env.sh`. `dev:prod-api` is explicit and banners loudly — avoid it for CMS writes.
