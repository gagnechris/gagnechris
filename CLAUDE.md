# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout
npm workspaces. Root `dev`, `build`, `test`, and `lint` delegate to the web app.

- `apps/web` — React/Vite site
- `infra` — AWS CDK app (later); bootstrap steps in `infra/RUNBOOK.md`
- `services/api` — Lambda handlers (later)
- `packages/shared` — types shared by the site, API, and publisher (later)
- `scripts/` — repo tooling (branch protection), not the site build

## Commands
- Build: `npm run build` (runs `tsc -b` then Vite in `apps/web`; generates `sitemap.xml` from published posts)
- Typecheck: `npm run typecheck` (runs `tsc -b` only)
- Lint: `npm run lint` (runs ESLint)
- Dev: `npm run dev` (starts Vite development server)
- Preview: `npm run preview` (previews production build locally)
- Test: `npm test` (runs Vitest)
- Deploy: `npm run deploy` (deploys to GitHub Pages via `gh-pages`)
- CI: GitHub Actions runs lint, test, and build (including typecheck) on pushes and PRs to `main`
- Branch protection: `scripts/apply-branch-protection.sh` applies the `Protect main` ruleset from `scripts/main-branch-ruleset.json` (require PR, require **Lint, test, and build**, block force-push/delete)

## Workflow
- One Linear ticket → one git branch → one PR into `main`. Do not push commits directly to `main`.
- Prefer the Linear issue `gitBranchName` when creating the branch.
- Merge only after CI is green on the PR.

## Hosting & Integrations
- **Hosting**: GitHub Pages with custom domain `gagnechris.com`
- **Contact form**: Formspree
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