# Git workflow

- One Linear ticket → one branch → one PR into `main`. Do not commit or push directly to `main`.
- Use the branch name from the Linear issue (`gitBranchName`), e.g. `gagnechris/chr-57-…`, not a tool-generated name, so Linear links the PR. CI (`scripts/ci/check-branch-name.sh`) fails a PR whose branch carries no ticket id, except a Dependabot branch.
- Work in a separate `git worktree` per ticket when more than one agent or session shares this machine. Never stash or switch branches in a checkout that another session is using.
- `npm install` installs a `pre-push` hook that runs `npm run verify`, the CI checks your changes can affect. Don't bypass it with `--no-verify`; fix what it reports.
- Open a PR and wait for every required check to pass before merging: **Lint, test, and build**, **Local E2E smoke**, **API integration (DynamoDB Local)** and **Mobile typecheck, lint, test, bundle**.
- A branch must be up to date with `main` to merge, so the merged tree is the one CI passed and the merge deploys without CI running again on `main`. When `main` moves on, merge `origin/main` into the branch (or use **Update branch**; for Dependabot, `update_pull_request_branch`) and wait for green again.
- After you merge, watch the **CDK** run for your merge commit until it finishes. CI and Mobile run on `main` only when a lockfile, the Go modules or the setup action change, and weekly. If one goes red (you'll also get an alert email), fix it forward with a PR before merging anything else. A red `main` from a flaky or date-dependent test still gets a fix to the test; a re-run is not a fix.
- Branch protection on `main` is defined in `scripts/main-branch-ruleset.json`, and the `ios-v*` release tag ruleset in `scripts/ios-release-tag-ruleset.json`; `scripts/apply-branch-protection.sh` applies both.
