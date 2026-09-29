# Development

## Prerequisites

- **Node.js** 22.12+ (see `.nvmrc`; `.npmrc` sets `engine-strict=true`)
- **npm** (workspaces)
- **Docker** for DynamoDB Local (`npm run local:dev` / `e2e:local`)

```bash
nvm install   # reads .nvmrc
nvm use
npm ci
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

Open [http://localhost:5173/admin](http://localhost:5173/admin). Vite proxies `/api` → local API and `/blog` / `/__site` → the static origin (mirrors production CloudFront routing). Fake local sign-in never uses Cognito or prod AWS.

More detail: [local-e2e.md](./local-e2e.md).

## Vite-only

```bash
npm run dev           # API → local (default)
npm run dev:prod-api  # API → https://gagnechris.com (prints PRODUCTION banner)
```

Prefer `local:dev` unless you intentionally need the production API.

## Quality gates

```bash
npm test              # web + shared + infra + api + publisher (unit; no Docker)
npm run test:integration -w @gagnechris/api   # DynamoDB Local transaction paths (Docker)
npm run typecheck     # all workspaces with a typecheck script
npm run lint          # ESLint for every workspace
npm run format:check  # Prettier check (CI)
npm run format        # Prettier write
npm run build         # tsc -b + Vite → apps/web/dist
npm run e2e:local     # one-shot CMS smoke against DynamoDB Local
```

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
| `VITE_LOCAL_SITE_ORIGIN`     | Dev only: publisher static origin for `/__site` + `/blog`           |
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

### Integration tests (CHR-151)

`npm run test:integration -w @gagnechris/api` **ignores** `DATA_TABLE_NAME`. Each file creates an ephemeral `gagnechris-it-*` table and deletes it afterward, so sourcing `env.sh` and running tests will not wipe `gagnechris-local`. Tables that do not start with `gagnechris-it-` are refused.

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

Use the stable Compose project name (`gagnechris`) so worktrees share one Local instance, or stop the conflicting container/process. Override with `AWS_ENDPOINT_URL_DYNAMODB` / Compose port mapping only if you know you need a second instance.

### Admin still hits Cognito locally

Ensure `npm run local:dev` (or export `VITE_AUTH_MODE=local`). A plain `npm run dev` without local env will expect real Cognito config.

### Publish succeeds but `/blog/<slug>` looks stale

Locally, confirm the static origin on `:4177` was rebuilt (API wrapper triggers publisher). Hard-refresh Vite; blog HTML is loaded from `/__site/...`, not only the SPA bundle.

### Accidentally pointed at prod

`DATA_TABLE_NAME=gagnechris-prod` is refused by `scripts/local/env.sh`. `dev:prod-api` is explicit and banners loudly — avoid it for CMS writes.
