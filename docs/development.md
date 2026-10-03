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
# lockfile so web / API / infra work never installs React Native (CHR-150).
npm ci --prefix apps/mobile
```

## Day-to-day: full local CMS

```bash
npm run local:dev
```

Starts DynamoDB Local (Compose project `gagnechris`), bootstraps `gagnechris-local`, seeds a publisher shell under `.local-site/`, runs:

| Process                                    | Port (default) |
| ------------------------------------------ | -------------- |
| Local API (`services/api/local/server.ts`) | `8787`         |
| Static publisher origin                    | `4177`         |
| Vite (`VITE_AUTH_MODE=local`)              | `5173`         |

Open [http://localhost:5173/admin](http://localhost:5173/admin). Vite proxies `/api` → local API and `/__site` → the static origin (mirrors production CloudFront routing). Fake local sign-in never uses Cognito or prod AWS.

**Admin PWA (CHR-48):** production `/spa.html` (CloudFront `/admin/*`) ships `manifest.json` + `/icons/*` for iPhone Add to Home Screen (`display: standalone`, start at `/admin/notebook`). Vite serves the same files from `apps/web/public/` in local dev; offline caching is optional and not enabled yet.

More detail: [local-e2e.md](./local-e2e.md).

## Vite-only

```bash
npm run dev           # API → local (default)
npm run dev:prod-api  # API → https://gagnechris.com (prints PRODUCTION banner)
```

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
npm run build         # tsc -b + Vite → apps/web/dist
npm run e2e:local     # one-shot CMS smoke against DynamoDB Local
```

The root scripts skip `apps/mobile`; its gates (including a real Metro bundle
that is executed, not just built) run with `--prefix apps/mobile`. See
[mobile.md](./mobile.md).

## Environment variables

### Vite (`apps/web`)

| Variable                     | Notes                                                               |
| ---------------------------- | ------------------------------------------------------------------- |
| `VITE_COGNITO_USER_POOL_ID`  | Required for real Cognito admin auth                                |
| `VITE_COGNITO_WEB_CLIENT_ID` | Required for real Cognito admin auth                                |
| `VITE_COGNITO_AUTH_DOMAIN`   | Cognito domain host                                                 |
| `VITE_API_BASE_URL`          | Optional; default same-origin                                       |
| `VITE_API_TARGET`            | Dev only: set `prod` to proxy `/api` to production                  |
| `VITE_LOCAL_API_ORIGIN`      | Dev only: local API origin (set by `scripts/local/env.sh`)          |
| `VITE_LOCAL_SITE_ORIGIN`     | Dev only: publisher static origin for `/__site` (`/writing` posts)  |
| `VITE_AUTH_MODE`             | Dev only: `local` fakes sign-in; **forbidden in production builds** |

### Local stack (`scripts/local/env.sh`)

| Variable                             | Default / notes                                       |
| ------------------------------------ | ----------------------------------------------------- |
| `AWS_ENDPOINT_URL_DYNAMODB`          | `http://127.0.0.1:8000`                               |
| `DATA_TABLE_NAME`                    | `gagnechris-local` (refuses `gagnechris-prod`)        |
| `SITE_BUCKET_NAME`                   | Repo `.local-site/` filesystem “bucket”               |
| `LOCAL_API_PORT` / `LOCAL_SITE_PORT` | `8787` / `4177`                                       |
| `COMPOSE_PROJECT_NAME`               | `gagnechris` (shared DynamoDB Local across worktrees) |

Fake AWS keys are set; `AWS_PROFILE` is unset so the local stack cannot accidentally use SSO credentials.

### Integration tests (CHR-151 / CHR-163)

`npm run test:integration -w @gagnechris/api` **ignores** `DATA_TABLE_NAME`. Each file creates an ephemeral `gagnechris-it-*` table and deletes it afterward, so sourcing `env.sh` and running tests will not wipe `gagnechris-local`. Tables that do not start with `gagnechris-it-` are refused.

Compose always uses project `gagnechris-ci` (`-p gagnechris-ci`), never `env.sh`'s `gagnechris`, and teardown runs only when this process started the container. A stale started-flag under `os.tmpdir()` cannot stop `gagnechris-dynamodb-1`.

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

GitHub Actions API integration uses Compose project `gagnechris-ci` on host port **8001** (`docker-compose.ci.yml`) so a long-running CI container does not block `npm run local:dev` on **8000**.

### Admin still hits Cognito locally

Ensure `npm run local:dev` (or export `VITE_AUTH_MODE=local`). A plain `npm run dev` without local env will expect real Cognito config.

### Publish succeeds but `/writing/<slug>` looks stale

Locally, confirm the static origin on `:4177` was rebuilt (API wrapper triggers publisher). Hard-refresh Vite; post HTML is loaded from `/__site/...`, not only the SPA bundle.

### Accidentally pointed at prod

`DATA_TABLE_NAME=gagnechris-prod` is refused by `scripts/local/env.sh`. `dev:prod-api` is explicit and banners loudly — avoid it for CMS writes.
