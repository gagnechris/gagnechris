# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout
npm workspaces. Root `dev`, `build`, `test`, and `lint` delegate to the web app.

- `apps/web` — React/Vite site
- `infra` — AWS CDK app; bootstrap steps in `infra/RUNBOOK.md`
- `services/api` — Lambda handlers (later)
- `packages/shared` — types shared by the site, API, and publisher (later)
- `scripts/` — repo tooling (branch protection), not the site build

## Commands
- Build: `npm run build` (runs `tsc -b` then Vite in `apps/web`; generates `sitemap.xml` from published posts)
- Typecheck: `npm run typecheck` (runs `tsc -b` only)
- Lint: `npm run lint` (runs ESLint)
- Dev: `npm run dev` (starts Vite development server)
- Preview: `npm run preview` (previews production build locally)
- Test: `npm test` (Vitest for web + infra)
- CDK: `npm run cdk -- synth` (prod only, region `us-east-1`; account from credentials / `CDK_ACCOUNT`; `ALERTS_EMAIL` for Guardrails)
- Deploy web: `npm run deploy:web` (or CI on merge to `main`: build → S3 sync → CloudFront invalidation)
- CI: lint/test/build/synth; OIDC CDK diff on PRs, deploy on main, nightly drift
- Branch protection: `scripts/apply-branch-protection.sh` applies the `Protect main` ruleset from `scripts/main-branch-ruleset.json` (require PR, require **Lint, test, and build**, block force-push/delete)
- GitHub `prod` environment: `scripts/apply-github-environments.sh` (deployments from `main` only)

## Workflow
- One Linear ticket → one git branch → one PR into `main`. Do not push commits directly to `main`.
- Prefer the Linear issue `gitBranchName` when creating the branch.
- Merge only after CI is green on the PR.
- **Definition of done:** ticket is Done only after merge, deploy finished, and acceptance criteria verified live (paste evidence in Linear). See `.cursor/rules/definition-of-done.mdc`.
- **AWS changes:** never hand-edit production resources; use CDK / `cdk import`. Ask before break-glass admin changes. See `.cursor/rules/aws-changes.mdc`.

## Hosting & Integrations
- **Hosting**: AWS (S3 + CloudFront) for `gagnechris.com`
- **Contact form**: `POST /api/contact` → SES (CHR-38)
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