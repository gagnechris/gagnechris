# Engineer brief

The brief a coordinating session gives each agent it asks to implement a ticket. The coordinator splits the work, reviews the PRs, merges them and checks them live. The engineer's job ends at a green PR.

## Before you start

- Read [`CLAUDE.md`](../../CLAUDE.md) and the other rules in this folder, especially [definition-of-done](./definition-of-done.md), [git-workflow](./git-workflow.md), [comments-and-docs](./comments-and-docs.md) and, for any UI change, [shared-components](./shared-components.md). Then read the docs your change touches: [architecture](../architecture.md), [data-model](../data-model.md), [development](../development.md), [adding-an-entity](../adding-an-entity.md), [mobile](../mobile.md) and `infra/RUNBOOK.md`.
- Read your ticket and its comments in Linear. The acceptance criteria are the contract. Never reword a criterion to match what you built.
- Check that nobody else is already on it: look for a remote branch or open PR for the ticket. If you find one, stop and report.

## Isolation

- Work only in your own git worktree, created from a fresh `origin/main` on the ticket's Linear `gitBranchName`. Never work in the main checkout or in another agent's worktree; other sessions switch branches there.
- Run your own DynamoDB Local container on a random high port, and point the integration suite at it with `INTEGRATION_DYNAMODB_ENDPOINT=http://127.0.0.1:<port> SKIP_DYNAMODB_INTEGRATION_SETUP=1`. Ports 8000 and 8001 and the Compose projects `gagnechris` and `gagnechris-ci` are shared, so leave them alone. Remove your container when you're done.
- Use unique ports for anything else you start (Vite, Metro, a local API), and stop it when you're done.

## What you may not do

- No AWS writes, no deploys, no Linear writes, no merging, no pushing to `main`, no force-push.
- Use read-only AWS access (`AWS_PROFILE=gagnechris-readonly`) only when the ticket needs it. Never print the content of Notebook notes or tasks.
- Never sign in to production as the owner.

## Tests that prove the fix

- Every acceptance criterion needs a test that **fails when the fix is reverted**. Revert the fix, run the test, watch it fail, then restore the fix. Say so in the PR body.
- Match the surrounding code's style. Keep comments sparse. Update docs in the same PR when behavior or commands change.

## Git safety

- Never squash with `git reset --soft origin/main`, and never rebase onto a moving `origin/main`. Other worktrees' fetches move it, and you'd silently revert work that has already merged.
- Before every push, check that `git diff origin/main...HEAD --stat` lists only your ticket's files.
- If `main` moves and your PR conflicts, merge `origin/main` into your branch and re-run the checks.

## Done for you = PR opened, not merged

1. Run `npm run verify` (the pre-push hook runs it too; never push with `--no-verify`), plus the integration, browser or mobile checks your change touches. For a UI change, run the specs it touches on Chromium (`npm run e2e:browser -- --project=chromium <spec>`); cloud sessions can, see [local-e2e](../local-e2e.md).
2. Push and open the PR. Fill in [`.github/pull_request_template.md`](../../.github/pull_request_template.md): Before and After, how, a table of each criterion with the test that proves it and the revert result (for a refactor or docs-only PR, one row saying there is nothing to revert), a test plan and `Fixes` with the ticket id. Don't enable auto-merge.
3. Wait for the required checks, and fix any failures.
4. Report back:
   - the PR link;
   - the evidence for each criterion and the revert results;
   - anything you couldn't do or verify, and why;
   - follow-ups.

   Leave your worktree in place; the coordinator removes it after the merge.

## Queues

You may be given several tickets in a row. Do them in order, each one in its own worktree, branch and PR, starting from a fresh `origin/main`. If a ticket depends on a PR of yours that hasn't merged yet, branch from that PR and say so. Report each PR when its checks are green, then move on without waiting.

## iOS

- `apps/mobile` isn't a root workspace. Install it with `npm ci --prefix apps/mobile`. For any mobile change, run its typecheck, lint and tests plus the bundle checks (`export:ios`, `check:bundle`, `smoke:bundle`), and the root `npm run check:rn-bundles`.
- Build to the simulator with `npm run ios:sim --prefix apps/mobile <udid>`, with Metro started separately on a unique port. Always pass an explicit simulator UDID, because several may be booted.
- The phone artboards are the spec for both mobile web and iOS.
