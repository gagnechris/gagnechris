# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

npm workspaces. Root scripts delegate across workspaces (see Commands).

- `apps/web` — React/Vite: public site (`gagnechris.com`), admin (`admin.`) and Notebook (`notebook.`) apps; three Vite targets via `WEB_APP`
- `services/api` — Lambda HTTP API
- `services/publisher` — DynamoDB Streams → prerender HTML/PDF/RSS/sitemap
- `services/restore-test` — AWS Backup restore-test validator + leftover restore-table check
- `packages/shared` — types, schemas, HTML helpers shared by site, API, publisher
- `packages/data` — DynamoDB keys, item schemas, DocumentClient, and Dynamo write helpers for API + publisher
- `packages/api-client` — OpenAPI types + `createApiClient({ baseUrl, getToken? })`
- `packages/app-core` — UI-free admin hooks (autosave, versioned entity editor, TanStack Query resource factory)
- `packages/tokens` — design tokens (TS → generated CSS variables for web)
- `apps/mobile` — Expo app; **not a root workspace**, own lockfile — install with `npm ci --prefix apps/mobile`; see `docs/mobile.md`
- `infra` — AWS CDK app; bootstrap/ops in `infra/RUNBOOK.md`
- `e2e` — Playwright browser tests (`@gagnechris/e2e` workspace: config, stack global setup, fake-auth + API seeding fixtures)
- `scripts/` — local stack, web deploy, branch protection
- `docs/` — architecture, development, data model, adding a Notebook or publishable entity (`docs/adding-an-entity.md`), local E2E

## Commands

- Build: `npm run build` (`tsc -b`, then the public, admin and Notebook Vite builds → `apps/web/dist`, `dist-admin`, `dist-notebook`; the public build fails if it bundles admin, Notebook or auth code)
- Web shell guard: `npm run check:web-shells` (after build: GA in the public shell exactly when `GA_MEASUREMENT_ID` is set, never in the app shells, no inline script in any shell, demo code only in lazy chunks, no third-party script in the app shells)
- Typecheck: `npm run typecheck` (all workspaces with a typecheck script)
- Lint: `npm run lint` (ESLint for every workspace); `npm run format:check` (Prettier)
- Case collisions: `npm run check:case-collisions` (fails when two tracked paths, or two JS/TS module paths ignoring extension, differ only by case; CI runs it)
- Dev (Vite only): `npm run dev` (public :5173, admin :5174, Notebook :5175; `npm run dev -- notebook` for one; API proxied to local by default)
- Dev → prod API: `npm run dev:prod-api` (prints PRODUCTION banner)
- Local CMS stack: `npm run local:dev` (DynamoDB Local + API + publisher static + the three Vite apps; fake auth)
- Preview: `npm run preview` (public production build locally; `WEB_APP=admin` or `notebook` for the others)
- Test: `npm test` (Vitest via `--workspaces --if-present`; mobile is separate — `npm test --prefix apps/mobile`)
- Token drift: `npm run tokens:check` (regenerates `packages/tokens/src/variables.css`, fails on diff)
- Publish surface drift: `npm run publish-surface:check` (regenerates the CloudFront Option B page list + local publish-relevance routes from publisher targets; fails on diff)
- Local E2E: `npm run e2e:local` (publish lifecycle smoke: the Playwright `api` project, `e2e/tests/publish-lifecycle.spec.ts`, on its own stack)
- Browser E2E: `npm run e2e:browser` (Playwright, Chromium + WebKit, own stack on free ports; `-- --ui` to debug); see `docs/local-e2e.md`
- CDK: `npm run cdk -- synth` (prod only, region `us-east-1`; account from credentials / `CDK_ACCOUNT`; `ALERTS_EMAIL` for Guardrails)
- Deploy web: `npm run deploy:web` (or CI on merge to `main`: build → each app to its own bucket → CloudFront invalidations; the apex sync deletes whatever the public build doesn't produce, except publisher-owned paths)
- CI: lint/typecheck/test/build/synth; the **Local E2E smoke (CHR-82)** job builds the web app and runs `e2e:browser`, whose `api` project (the publish lifecycle smoke) runs before the browser projects (report, traces, screenshots, video uploaded as `playwright-report-*` on failure); OIDC CDK diff on PRs, deploy on main (read-only `plan` job, then `deploy`), nightly drift, hourly deploy-lag check; a red `main`, a failed deploy or prod over 2 h behind `main` emails the alerts topic (`infra/RUNBOOK.md`, Deploy alerts). Every action is SHA-pinned and jobs with `id-token: write` install with `--ignore-scripts` (enforced by `infra/test/ci-workflows.test.ts`)
- Branch protection: `scripts/apply-branch-protection.sh` applies the `Protect main` ruleset from `scripts/main-branch-ruleset.json` (require PR; required checks: **Lint, test, and build**, **Local E2E smoke (CHR-82)**, **API integration (DynamoDB Local)**, **Mobile typecheck, lint, test, bundle**; block force-push/delete; PRs need not be up to date with `main` — a red `main` is emailed by `.github/workflows/main-ci-alert.yml` and blocks the deploy). Every required check reports on every PR (path filters run inside the job, never at workflow level), so re-run the script after changing the list
- GitHub `prod` environment: `scripts/apply-github-environments.sh` (deployments from `main` only)

Publisher (not the Vite build) generates prerendered HTML, `posts.json`, `rss.xml`, `sitemap.xml`, and `resume.pdf` on publish.

## Workflow

- One Linear ticket → one git branch → one PR into `main`. Do not push commits directly to `main`.
- Use the Linear issue `gitBranchName` for the branch. Use a separate `git worktree` per ticket when other agents or sessions share the checkout.
- Merge only after CI is green on the PR.
- **Definition of done:** ticket is Done only after merge, deploy finished, and **each** acceptance criterion verified live, with evidence per AC in Linear (a 200 or 401 isn't evidence). Read your own diff before merging, and check that tests fail when the fix is reverted. See `.cursor/rules/definition-of-done.mdc`.
- **AWS changes:** never hand-edit production resources; use CDK / `cdk import`. Ask before break-glass admin changes. See `.cursor/rules/aws-changes.mdc`.
- **Docs:** if a change affects setup, architecture, commands, or infra, update the relevant doc (`docs/`, root `README.md`, `CLAUDE.md`, or `infra/RUNBOOK.md`) in the same PR.

## Hosting & Integrations

- **Hosting**: AWS (S3 + CloudFront) for `gagnechris.com`, `admin.gagnechris.com` and `notebook.gagnechris.com`, one distribution each. Old apex `/admin*` and `/auth*` URLs 301 to the app hosts; the apex never signs in
- **Contact form**: `POST /api/contact` → SES
- **Analytics**: Google Analytics 4, only in the production public build (`GA_MEASUREMENT_ID`, set by `scripts/deploy-web.sh`); local, preview and e2e builds load no GA
- **Node**: requires Node.js 22.12+ (see `.nvmrc`)

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
