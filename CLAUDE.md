# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

npm workspaces. Root scripts delegate across workspaces (see Commands).

- `apps/web` — React/Vite site + admin
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
- `scripts/` — local stack, web deploy, branch protection
- `docs/` — architecture, development, data model, adding a Notebook entity (`docs/adding-an-entity.md`), local E2E

## Commands

- Build: `npm run build` (`tsc -b` then Vite in `apps/web`)
- Typecheck: `npm run typecheck` (all workspaces with a typecheck script)
- Lint: `npm run lint` (ESLint for every workspace); `npm run format:check` (Prettier)
- Dev (Vite only): `npm run dev` (API proxied to local by default)
- Dev → prod API: `npm run dev:prod-api` (prints PRODUCTION banner)
- Local CMS stack: `npm run local:dev` (DynamoDB Local + API + publisher static + Vite; fake auth)
- Preview: `npm run preview` (production build locally)
- Test: `npm test` (Vitest via `--workspaces --if-present`; mobile is separate — `npm test --prefix apps/mobile`)
- Token drift: `npm run tokens:check` (regenerates `packages/tokens/src/variables.css`, fails on diff)
- Publish surface drift: `npm run publish-surface:check` (regenerates CloudFront Option B prefixes + local publish-relevance routes from publisher targets; fails on diff)
- Local E2E: `npm run e2e:local`
- CDK: `npm run cdk -- synth` (prod only, region `us-east-1`; account from credentials / `CDK_ACCOUNT`; `ALERTS_EMAIL` for Guardrails)
- Deploy web: `npm run deploy:web` (or CI on merge to `main`: build → S3 sync → CloudFront invalidation)
- CI: lint/typecheck/test/build/synth; OIDC CDK diff on PRs, deploy on main (read-only `plan` job, then `deploy`), nightly drift. Every action is SHA-pinned and jobs with `id-token: write` install with `--ignore-scripts` (enforced by `infra/test/ci-workflows.test.ts`)
- Branch protection: `scripts/apply-branch-protection.sh` applies the `Protect main` ruleset from `scripts/main-branch-ruleset.json` (require PR; required checks: **Lint, test, and build**, **Local E2E smoke (CHR-82)**, **API integration (DynamoDB Local)**, **Mobile typecheck, lint, test, bundle**; block force-push/delete). Every required check reports on every PR (path filters run inside the job, never at workflow level), so re-run the script after changing the list
- GitHub `prod` environment: `scripts/apply-github-environments.sh` (deployments from `main` only)

Publisher (not the Vite build) generates prerendered HTML, `posts.json`, `rss.xml`, `sitemap.xml`, and `resume.pdf` on publish.

## Workflow

- One Linear ticket → one git branch → one PR into `main`. Do not push commits directly to `main`.
- Prefer the Linear issue `gitBranchName` when creating the branch.
- Merge only after CI is green on the PR.
- **Definition of done:** ticket is Done only after merge, deploy finished, and acceptance criteria verified live (paste evidence in Linear). See `.cursor/rules/definition-of-done.mdc`.
- **AWS changes:** never hand-edit production resources; use CDK / `cdk import`. Ask before break-glass admin changes. See `.cursor/rules/aws-changes.mdc`.
- **Docs:** if a change affects setup, architecture, commands, or infra, update the relevant doc (`docs/`, root `README.md`, `CLAUDE.md`, or `infra/RUNBOOK.md`) in the same PR.

## Hosting & Integrations

- **Hosting**: AWS (S3 + CloudFront) for `gagnechris.com`
- **Contact form**: `POST /api/contact` → SES
- **Analytics**: Google Analytics 4
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
