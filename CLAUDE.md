# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

npm workspaces. Root scripts delegate across workspaces (see Commands).

- `apps/web` — React/Vite: public site (`gagnechris.com`), admin (`admin.`) and Notebook (`notebook.`) apps; three Vite targets via `WEB_APP`
- `services/api` — the Go API and the Go module for every Go Lambda: `cmd/<name>` per function (`api`: the HTTP API, every route; `restore-test`: AWS Backup restore-test validator, plus the daily leftover restore-table and backup-freshness check), shared code under `internal/` (`api` router, auth and errors; `store` cursors and versioned/publishable writes; one package per route group); `internal/contract/contract.json` and `internal/apitypes` (API types, oapi-codegen) are generated from the TypeScript packages; `tools` pins golangci-lint and oapi-codegen; `test` is the black-box HTTP suite (`@gagnechris/api-tests` workspace, `test/http`)
- `services/publisher` — DynamoDB Streams → prerender HTML/PDF/RSS/sitemap
- `packages/shared` — types, schemas, HTML helpers shared by site, API, publisher; the domain entry is what iOS bundles, server-only values (service names, metric names, contact and SES caps, restore-test settings) live in `@gagnechris/shared/server`
- `packages/data` — DynamoDB keys, item schemas and builders, table definition and DocumentClient. The Go API writes every row; this package serves the publisher, ops tools, infra, contract generation (`scripts/generate-go-contract.ts`) and tests, and exports only what they import (`scripts/test/exports-used.test.ts`, which holds `shared`, `app-core` and `ui` to the same rule apart from the older names listed in `scripts/test/exports-unused.json`)
- `packages/ops` — operator tools on the data table: note and task copy-back from a restore and row migrations; the CLIs are root `scripts/restore-copy-back.ts` and `scripts/migrate-*.ts`
- `packages/api-client` — OpenAPI types + `createApiClient({ baseUrl, getToken? })`
- `packages/app-core` — UI-free hooks shared by the admin and Notebook web apps and the iOS app (autosave, versioned entity editor, TanStack Query resources)
- `packages/ui` — shared web UI primitives (`Button`, `IconButton`, `Field` and the text, date, search, select and file inputs, `Combobox`, `Checkbox`, `RadioCardGroup`, `Chip`/`ChipSelect`/`ChipsInput`, `Tabs`, `Menu`, `Dialog`/`Drawer`/`Scrim`, `Card`, `List`/`ListRow`, `Toolbar`, `DragHandle`, `EmptyState`, `StatusBadge`, `SegmentedRadio`, `BottomSheet`, `ConfirmDialog`, `useModalDialog`, `useTabs`, `useDismiss`; `tone="editorial"` for the public look); components import no CSS and render on the server (the publisher renders them through `packages/public-ui`); Admin and Notebook load `@gagnechris/ui/styles.css` once, the public site imports the per-component stylesheets it uses from `public.css`. `docs/design/components.md` is the inventory and spec
- `packages/public-ui` — router-free public page components; the publisher renders them with `react-dom/server` (`/server` entry) and the public app hydrates them
- `packages/tokens` — design tokens (TS → generated CSS variables for web)
- `apps/storybook` — Storybook catalog (`@gagnechris/storybook`): stories in `src/` by area, sample data only (ESLint bans API and auth imports); imports `apps/web` components through the `@web/*` alias
- `apps/mobile` — Expo app; **not a root workspace**, own lockfile — install with `npm ci --prefix apps/mobile`; see `docs/mobile.md`
- `infra` — AWS CDK app; bootstrap/ops in `infra/RUNBOOK.md`
- `e2e` — Playwright browser tests (`@gagnechris/e2e` workspace: config, stack global setup, fake-auth + API seeding fixtures)
- `scripts/` — `@gagnechris/scripts` workspace (declares what the scripts import): local stack (`local/api.ts` builds and runs the Go API behind the local site hooks), web deploy, branch protection, CI guards, ops CLIs, and the repo-wide tests in `scripts/test` (CI workflows, ticket ids, case collisions, local and deploy scripts, lockfile parity, package exports in use)
- `docs/` — architecture, development, data model, adding a Notebook or publishable entity (`docs/adding-an-entity.md`), local E2E, agent rules (`docs/agent-rules/`)

## Commands

- Build: `npm run build` (`tsc -b`, then the public, admin and Notebook Vite builds → `apps/web/dist`, `dist-admin`, `dist-notebook`; the public build fails if it bundles admin, Notebook or auth code)
- Web shell guard: `npm run check:web-shells` (after build: GA in the public shell exactly when `GA_MEASUREMENT_ID` is set, never in the app shells, no inline script in any shell, no public entry asset beyond `PUBLIC_ENTRY_ASSETS`, entry JS within `PUBLIC_ENTRY_JS_BUDGET` and free of zod, self-hosted fonts named for their content with one preload on the public shell, demo code only in lazy chunks, no third-party script in the app shells)
- Go contract drift: `npm run go:generate:check` (regenerates `services/api/internal/contract/contract.json` from `packages/shared` and `packages/data`: item JSON Schemas, key formats, GSI names, API and restore-test constants and EMF metric names, request and schema limits, Notebook limits and default daily templates, sync constants, the Home and Resume defaults, user access groups and levels, sample rows, API response samples and text-helper test cases; and `services/api/internal/apitypes/apitypes.gen.go` from the OpenAPI file; fails on diff). `npm run openapi` runs `go:generate` too. `npm run go:fmt` formats Go
- Verify before push: `npm run verify` (Prettier and ESLint on changed files, typecheck and tests of changed workspaces and their dependents, generated-file drift whose inputs changed, Go lint/test when Go changed; `verify:all` runs everything). `npm install` sets `core.hooksPath` to `.githooks`, whose `pre-push` runs it
- Typecheck: `npm run typecheck` (all workspaces with a typecheck script)
- Lint: `npm run lint` (ESLint for every workspace); `npm run format:check` (Prettier); `npm run go:lint` (golangci-lint on `services/api/`, version pinned in `services/api/tools/go.mod`)
- Case collisions: `npm run check:case-collisions` (fails when two tracked paths, or two JS/TS module paths ignoring extension, differ only by case; CI runs it)
- Other CI guards: `npm run openapi:check` (OpenAPI file and generated client drift), `npm run check:rn-bundles` (esbuild bundles of every `@gagnechris/*` entry and subpath mobile imports, each with a `react-native` export condition: no Node-only or banned imports; then lockfile parity: every runtime dependency of shared, api-client, app-core and tokens resolves to the same version in the root and `apps/mobile` lockfiles), `npm run check:platform-neutral-lint` (the ESLint bans in platform-neutral packages, and the plain-control ban in web and public-ui code, still fire), `npm run check:tsconfig-coverage` (each workspace's typecheck covers every `.ts` file in it)
- Dev (Vite only): `npm run dev` (public :5173, admin :5174, Notebook :5175; `npm run dev -- notebook` for one; API proxied to local by default)
- Dev → prod API: `npm run dev:prod-api` (prints PRODUCTION banner)
- Local CMS stack: `npm run local:dev` (DynamoDB Local + the Go API, built once at start + publisher static + the three Vite apps; fake auth)
- Preview: `npm run preview` (public production build locally; `WEB_APP=admin` or `notebook` for the others)
- Storybook: `npm run storybook` (the component catalog on :6006: `packages/ui`, the Admin, Notebook and workspace components from `apps/web`, the `packages/public-ui` page bodies, each with sample data and its iOS counterpart on the docs page); `npm run storybook:build` writes the static catalog to `apps/storybook/storybook-static` (CI runs it in **Lint, test, and build**). Published at `https://components.gagnechris.com` (noindex) by `scripts/deploy-components.sh`, which CI runs on merge to `main` when `scripts/ci/deploy-paths.sh` reports `components=true`
- Test: `npm test` (Vitest via `--workspaces --if-present`; mobile is separate — `npm test --prefix apps/mobile`); `npm run go:test` (`go test` on `services/api/`); `npm run go:vulncheck` (govulncheck on `services/api/`, reachable Go advisories; CI runs it); `npm run test:integration -w @gagnechris/api-tests` (DynamoDB Local: the black-box HTTP suite in `services/api/test/http` against the Go API, which the setup builds unless `GO_API_BIN` is set, plus the ops tool tests; see `docs/development.md`)
- Token drift: `npm run tokens:check` (regenerates `packages/tokens/src/variables.css`, fails on diff)
- Publish surface drift: `npm run publish-surface:check` (regenerates the CloudFront Option B page list, KVS keys and slug cap, local publish-relevance routes and the publisher-owned S3 key list from publisher targets; fails on diff)
- Local E2E: `npm run e2e:local` (publish lifecycle smoke: the Playwright `api` project, `e2e/tests/publish-lifecycle.spec.ts`, on its own stack)
- Browser E2E: `npm run e2e:browser` (Playwright, Chromium + WebKit, own stack on free ports; `-- --ui` to debug); see `docs/local-e2e.md`
- CDK: `npm run cdk -- synth` (prod only, region `us-east-1`; account from credentials / `CDK_ACCOUNT`; `ALERTS_EMAIL` or `-c alertsEmail=` required)
- Deploy web: `npm run deploy:web` (or CI on merge to `main` when `scripts/ci/deploy-paths.sh` reports `web=true`: build → each app to its own bucket → CloudFront invalidations; the apex sync deletes whatever the public build doesn't produce, except publisher-owned paths)
- CI: lint/typecheck/test/build/synth, the Storybook build, plus Go lint, test and vulnerability check (the shared setup action installs Go from `services/api/go.mod`; the mobile jobs pass `go: 'false'` and add `apps/mobile/package-lock.json` to the npm cache key); **Local E2E smoke** runs `e2e:browser` against the Go API in one job per browser (Chromium, WebKit), each running the `api` project (the publish lifecycle smoke) first, with one retry in CI and flaky tests listed in the job summary; the required **Local E2E smoke** check passes when both browser jobs do (report, traces, screenshots, video uploaded as `playwright-report-*` on failure); OIDC CDK diff on PRs, deploy on main (read-only `plan` job, then `deploy`), iOS TestFlight builds from `ios-v*` tags (`ios-release.yml`, which runs the same `scripts/ci/mobile-checks.sh` as the Mobile check, builds without `EXPO_TOKEN` through `scripts/ci/eas-local-build.sh` and submits from a separate job), nightly drift, hourly deploy-lag check, a manual PITR restore rehearsal (`pitr-rehearsal.yml`); a red `main`, a failed deploy or prod over 2 h behind `main` emails the alerts topic through `scripts/ci/notify-alerts.sh` (`infra/RUNBOOK.md`, Deploy alerts). Every action is SHA-pinned, jobs with `id-token: write` or a secret install with `--ignore-scripts`, and a native build that runs install scripts (the iOS release's local EAS build) runs without the secret and after every step that holds it (enforced by `scripts/test/ci-workflows.test.ts`)
- Branch protection: `scripts/apply-branch-protection.sh` applies the `Protect main` ruleset from `scripts/main-branch-ruleset.json` (require PR; required checks: **Lint, test, and build**, **Local E2E smoke**, **API integration (DynamoDB Local)**, **Mobile typecheck, lint, test, bundle**; block force-push/delete; PRs need not be up to date with `main` — a red `main` is emailed by `.github/workflows/main-ci-alert.yml` and blocks the deploy). Every required check reports on every PR (path filters run inside the job, never at workflow level), so re-run the script after changing the list
- GitHub environments: `scripts/apply-github-environments.sh` (`prod` deploys from `main` only, `testflight` from `ios-v*` tags only)

Publisher (not the Vite build) generates prerendered HTML, `posts.json`, `rss.xml`, `sitemap.xml`, and `resume.pdf` on publish.

## Workflow

- One Linear ticket → one git branch → one PR into `main`. Do not push commits directly to `main`.
- Use the Linear issue `gitBranchName` for the branch. Use a separate `git worktree` per ticket when other agents or sessions share the checkout.
- Merge only after CI is green on the PR.
- **Definition of done:** ticket is Done only after merge, deploy finished, and **each** acceptance criterion verified live, with evidence per AC in Linear (a 200 or 401 isn't evidence). Read your own diff before merging, and check that tests fail when the fix is reverted. See `docs/agent-rules/definition-of-done.md`.
- **AWS changes:** never hand-edit production resources; use CDK / `cdk import`. Ask before break-glass admin changes. See `docs/agent-rules/aws-changes.md`.
- **UI:** build from `@gagnechris/ui`; a missing component is added to `packages/ui` with a story first, and `docs/design/components.md` (the inventory) is updated in the same PR. Catalog: `https://components.gagnechris.com`. ESLint bans plain `button`, `input`, `select` and `textarea` in `apps/web/src` and `packages/public-ui`. See `docs/agent-rules/shared-components.md`.
- **Agent rules:** `docs/agent-rules/` holds the detailed rules, including `engineer-brief.md`, the brief an implementing agent gets from the coordinating session.
- **Docs:** if a change affects setup, architecture, commands, or infra, update the relevant doc (`docs/`, root `README.md`, `CLAUDE.md`, or `infra/RUNBOOK.md`) in the same PR.

## Hosting & Integrations

- **Hosting**: AWS (S3 + CloudFront) for `gagnechris.com`, `admin.gagnechris.com`, `notebook.gagnechris.com` and the Storybook catalog at `components.gagnechris.com` (`Components-prod`), one distribution each. Old apex `/admin*` and `/auth*` URLs 301 to the app hosts; the apex never signs in
- **Contact form**: `POST /api/contact` → SES
- **Analytics**: Google Analytics 4, only in the production public build (`GA_MEASUREMENT_ID`, set by `scripts/deploy-web.sh`); local, preview and e2e builds load no GA
- **Node**: requires Node.js 22.22.2+ (see `.nvmrc`)
- **Go**: the version in `services/api/go.mod`; any Go 1.21+ fetches it (`GOTOOLCHAIN=auto`). CDK synth compiles the Go Lambdas and the local stack, e2e and HTTP suite build the Go API, so all of them need Go

## Code Style Guidelines

- **TypeScript**: Strict mode enabled with comprehensive type checking
- **Formatting**: Follow ESLint recommended rules for TypeScript and React
- **Imports**: Group imports by dependency type, use named imports
- **Component Structure**: Functional components with React hooks
- **Naming**: Use camelCase for variables/functions, PascalCase for components
- **React Best Practices**:
  - Follow React hooks rules (enforced by eslint-plugin-react-hooks)
  - Use arrow functions for new components
  - Only export components from files (enforced by react-refresh)
- **Error Handling**: Use TypeScript's strict checking to catch errors at compile time

## Comments and Docs

- **Comments are sparse.** Comment only a non-obvious why: a constraint, a workaround, a surprising decision, an invariant that is easy to break. If deleting the comment loses nothing a careful reader couldn't get from the code, don't write it.
- Never narrate what the code does, restate a name, or explain the change you just made.
- Never put ticket ids, PR numbers, or history ("originally", "previously", "now uses", "after the migration") in comments, test names, or messages. History lives in git and Linear.
- No JSDoc on self-explanatory functions, props, or fields. One line beats a paragraph.
- **Docs** (`README.md`, `docs/`, `infra/RUNBOOK.md`, this file) describe what exists now and how to use it, in plain factual terms. No stories, no journey, no "we decided", no ticket references, no changelogs or run logs.
- When behavior changes, rewrite the affected doc text to the new current state instead of appending a note about the change.

<!-- BEGIN AWS Agent Toolkit rules -->

# AWS Guidance

- Where these AWS rules conflict with the project's own instructions, the
  project's instructions take precedence.
- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.

<!-- END AWS Agent Toolkit rules -->
