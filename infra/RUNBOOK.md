# AWS bootstrap runbook

One-time setup so this account is managed through IAM Identity Center and CDK, with no long-lived IAM access keys on a laptop.

**Operational constants** (account ID, org ID, Identity Center ARNs, portal URL, emails, hosted-zone IDs) live in a **private note**, not in this public repo. Look them up with the CLI when needed.

## Day-to-day access

```bash
export PATH="$HOME/.local/bin:$PATH"   # arm64 CLI on Apple Silicon if needed
export AWS_PROFILE=gagnechris-readonly
aws sso login --sso-session gagnechris
aws sts get-caller-identity
```

Use profile `gagnechris-admin` only for bootstrap and break-glass. Day-to-day CLI is SSO only — no long-lived access keys in `~/.aws/credentials`.

## Rebuild outline (CLI only)

Concrete IDs and values: private note. Commands:

1. **Working AWS CLI** — prefer a current arm64 install (`~/.local/bin`) over an old x86_64 Homebrew binary.
2. **Organization** — management account with Organizations feature set `ALL`; enable trusted access for `sso.amazonaws.com`.
3. **Identity Center** — enable an **organization** instance in the console (us-east-1). Account instances cannot host permission sets. Record instance ARN and Identity Store ID via `aws sso-admin list-instances`.
4. **User + permission sets** — create the Identity Center user; create `ReadOnly` (default, e.g. 8h) and `Admin` (break-glass, e.g. 1h); attach `ReadOnlyAccess` / `AdministratorAccess`; assign both to the account.
5. **Local SSO profiles** — `sso-session` + profiles `gagnechris-readonly` / `gagnechris-admin` in `~/.aws/config` (start URL from Identity Store id). Login and verify both profiles before deleting any IAM access keys.
6. **Remove IAM user access keys** — only after SSO works. Clear stale keys from `~/.aws/credentials`. Keep a console break-glass login until SSO-only is comfortable.
7. **CDK bootstrap** — after SSO Admin works:  
   `npx aws-cdk bootstrap aws://ACCOUNT/us-east-1 --profile gagnechris-admin`  
   (us-east-1 required for CloudFront certificates.)

   `CiDeployRole-prod` attaches `DenyPrivateDataReads` to the default-qualifier bootstrap lookup role (`cdk-hnb659fds-lookup-role-…`) so PR diff/drift cannot bypass the deny by assuming that role. The deny covers DynamoDB data reads (including `dynamodb:PartiQLSelect`), CloudWatch Logs reads (`GetLogEvents`, `FilterLogEvents`, `StartQuery`, `GetQueryResults`, `StartLiveTail`, `GetLogRecord`, `Unmask`) and X-Ray traces (`BatchGetTraces`, `GetTraceSummaries`, `GetTraceGraph`). Deploying `CiDeployRole-prod` applies it; no re-bootstrap is needed. Use the SSO `ReadOnly` / `Admin` profiles, not CI roles, to read logs. If you ever bootstrap with a custom `--qualifier`, update `CDK_DEFAULT_BOOTSTRAP_QUALIFIER` in `ci-deploy-role-stack.ts` to match.

## CDK app (`infra/`)

```bash
export AWS_PROFILE=gagnechris-readonly   # or gagnechris-admin for deploy
aws sso login --sso-session gagnechris

# Synth / diff are prod-only (region pinned to us-east-1; account from credentials via CDK_DEFAULT_ACCOUNT).
# Alerts email is never committed — set ALERTS_EMAIL (or -c alertsEmail=...).
export ALERTS_EMAIL='you@example.com'   # use the address from your private note
npm run cdk -- synth
npm run cdk -- diff
npm run cdk -- deploy Guardrails-prod --profile gagnechris-admin
```

After deploying Guardrails:

1. Confirm the SNS subscription email (AWS sends a Confirm subscription link).
2. Verify: `aws sns list-subscriptions-by-topic --topic-arn "$(aws ssm get-parameter --name /gagnechris/prod/alerts-topic-arn --query Parameter.Value --output text)" --profile gagnechris-readonly` — SubscriptionArn must not be `PendingConfirmation`.
3. `aws budgets describe-budgets --account-id "$CDK_DEFAULT_ACCOUNT" --profile gagnechris-readonly`
4. Optional test: `aws sns publish --topic-arn … --subject "gagnechris alert test" --message "ping" --profile gagnechris-admin` and confirm the email arrives.

If `list-subscriptions-by-topic` is empty while CloudFormation still shows an `AWS::SNS::Subscription` (deleted outside CFN), redeploy Guardrails so `AlertsEmailV2` recreates it, then confirm the email again.

Optional override without relying on the CLI: `export CDK_ACCOUNT=...`

### Stack dependency order

Deploy order (CDK `addDependency` + props):

1. Certificate, Guardrails, Data, Email, Auth (writes `cognito-admin-web-client-id`, `cognito-notebook-web-client-id`)
2. **Api** (depends on Auth; reads SSM `site-bucket-name` and both app client IDs; writes `http-api-id`)
3. **Site** (depends on Api; reads SSM `http-api-id`; writes `site-bucket-name`, `cloudfront-distribution-id`, `blog-slugs-kvs-arn`, and the bucket and distribution IDs for the admin and notebook hosts)
4. Dns (needs Site's three distributions for Route 53 aliases)
5. **Publisher** (depends on Site; reads Site's SSM params — no CFN exports from Site)
6. CiDeployRole

Site depends on Api so a replaced HttpApi updates CloudFront `/api/*` in the same deploy wave. Publisher looks up Site via SSM, not CloudFormation exports.

**Removing a cross-stack reference:** The producer stack (for example Auth) deploys before the consumer (Api). If a single PR drops both the consumer's use and the producer's export, the producer tries to delete an export that is still imported. It then rolls back and blocks every later deploy. Do it in two deploys instead:

1. Drop the consumer's use, but keep the export in the producer with `this.exportValue(<value>)`.
2. Once `aws cloudformation list-imports --export-name <export>` reports no importers, remove the `exportValue` line.

### First-time / disaster-recovery bootstrap (two-pass)

Site and Api each read an SSM parameter the other writes:

| Stack     | Needs SSM (must exist at deploy)    | Writes SSM                                                                |
| --------- | ----------------------------------- | ------------------------------------------------------------------------- |
| Api       | `/gagnechris/prod/site-bucket-name` | `http-api-id`, `http-api-url`                                             |
| Api       | Auth's two app client ID params     | (Auth writes them in step 1, so no placeholder is needed)                 |
| Site      | `/gagnechris/prod/http-api-id`      | `site-bucket-name`, `cloudfront-distribution-id`, `blog-slugs-kvs-arn`, … |
| Publisher | Site's three params above           | `publisher-function-name`, `publisher-function-arn`                       |

On a greenfield account those parameters do not exist yet. Practical sequence:

```bash
export ALERTS_EMAIL='you@example.com'
export AWS_PROFILE=gagnechris-admin

# 1. Stacks with no Site↔Api SSM coupling
npm run cdk -- deploy Certificate-prod Guardrails-prod Data-prod Email-prod Auth-prod --require-approval never

# 2. Seed placeholders so Api (and later Site) can resolve SSM on first create
aws ssm put-parameter --name /gagnechris/prod/site-bucket-name --type String --value placeholder-site-bucket --overwrite
aws ssm put-parameter --name /gagnechris/prod/http-api-id --type String --value placeholder --overwrite

# 3. Deploy Api (IAM media policy uses the placeholder bucket name — fine until pass 2)
npm run cdk -- deploy Api-prod --require-approval never

# 4. Deploy Site (reads real http-api-id from step 3; writes real site-bucket-name)
npm run cdk -- deploy Site-prod Dns-prod --require-approval never

# 5. Redeploy Api so media PutObject targets the real bucket name
npm run cdk -- deploy Api-prod --require-approval never

# 6. Publisher (SSM params from Site now exist) + CI roles
npm run cdk -- deploy Publisher-prod CiDeployRole-prod --require-approval never
```

After that, a normal `cdk deploy --all` (or CI) is enough: Site follows Api, Publisher follows Site. Do not hand-seed placeholders again unless you are rebuilding from scratch.

### Adopting existing resources (`cdk import`)

If CloudFormation reports a resource already exists, **do not delete it by hand**. Prefer:

1. `cdk import StackName` (or add the resource to the template with the same physical name and import), or
2. Retain the live resource and adopt it via lookup (`fromLookup` / `from*Attributes`) when CDK already supports that pattern (e.g. hosted zones).

Ask before any production change that is not a stack deploy.

## GitHub Actions OIDC

CI assumes short-lived roles (no AWS keys in GitHub).

1. Deploy the role stack once (laptop admin), then set repo variables:

```bash
export ALERTS_EMAIL='you@example.com'
AWS_PROFILE=gagnechris-admin npm run cdk -- deploy CiDeployRole-prod Guardrails-prod --require-approval never

# Copy ARNs from stack outputs, then:
gh variable set AWS_DEPLOY_ROLE_ARN --body 'arn:aws:iam::ACCOUNT:role/gagnechris-prod-gha-deploy'
gh variable set AWS_DIFF_ROLE_ARN --body 'arn:aws:iam::ACCOUNT:role/gagnechris-prod-gha-diff'
gh variable set AWS_DRIFT_ROLE_ARN --body 'arn:aws:iam::ACCOUNT:role/gagnechris-prod-gha-drift'
gh variable set AWS_PITR_REHEARSAL_ROLE_ARN --body 'arn:aws:iam::ACCOUNT:role/gagnechris-prod-gha-pitr-rehearsal'
gh variable set ALERTS_EMAIL --body "$ALERTS_EMAIL"
```

2. Lock the GitHub `prod` environment to `main` only:

```bash
bash scripts/apply-github-environments.sh
```

3. Require CI checks on `main` (includes Local E2E). PRs don't have to be up to date with `main` (`strict_required_status_checks_policy: false`), so two PRs that are green alone can break `main` together. That can't reach prod (deploy waits for CI on `main`), and **Main CI alert** (`.github/workflows/main-ci-alert.yml`) emails the alerts topic through the drift role when CI or Mobile fails on a push to `main`, or when the CI-triggered CDK run (`Plan deploy (main)` or `CDK + web deploy (main)`) fails. See [Deploy alerts](#deploy-alerts). Fix forward with a PR:

```bash
bash scripts/apply-branch-protection.sh
```

4. Workflows:
   - **CI** (`.github/workflows/ci.yml`): lint/test/build + Local E2E (path-filtered on PRs; includes `apps/web/**` and `packages/**`). Shared setup via `.github/actions/setup` (Node from `.nvmrc`). Concurrency cancels in-progress runs on PRs only — **main never cancels** so a cancelled CI cannot strand an undeployed infra commit.
   - **CDK** (`.github/workflows/cdk.yml`):
     - **PR (`CDK diff (PR)`):** `cdk synth` + `check:deployed-gsi` (early warning) + `cdk diff` (diff role); sticky PR comment.
     - **main deploy:** runs only after CI succeeds (`workflow_run`), as two jobs that share concurrency group `cdk-prod` (never cancels in flight):
       - **`Plan deploy (main)`** — read-only drift role. Runs only SHA-pinned `actions/checkout` and `aws-actions/configure-aws-credentials`, git, bash and the AWS CLI (no npm, no third-party action). `scripts/ci/read-deployed-sha.sh` reads SSM `deployed-sha`: `ParameterNotFound` (first deploy) → deploy everything; **any other SSM error fails the run**. `scripts/ci/check-deploy-ancestry.sh` refuses a deploy whose head is not a descendant of `deployed-sha`; if that SHA is not in the clone it is fetched, and if it still cannot be found the run fails instead of deploying everything. `scripts/ci/deploy-paths.sh` diffs `deployed-sha..head` (not `HEAD~1`) to decide CDK and/or web, so a cancelled infra build cannot strand changes behind a later docs-only commit. Docs-only merges skip deploy, including `*.md` under `infra/` (markdown never changes synth).
         - `infra/test/ci-workflows.test.ts` pins this: a docs-only head after an infra commit whose build never deployed gives `cdk=true` from `deployed-sha` (a `HEAD~1` base would give `cdk=false`).
       - **`CDK + web deploy (main)`** — checkout, `setup-node`, and `npm ci --ignore-scripts` all run **before** the AdministratorAccess deploy role is requested. It then re-reads `deployed-sha` (must equal what plan saw), runs `npm run check:deployed-gsi` against the live table, then `cdk deploy --all`, `scripts/deploy-web.sh`, and finally writes `deployed-sha`. Deploys never run a restore (see [Weekly restore testing](#weekly-restore-testing)). `workflow_dispatch` (mode `deploy`) deploys everything but still runs the ancestry and GSI checks.
     - **Supply chain:** `id-token: write` is job-wide: any step of such a job can mint an OIDC token, and the deploy and drift roles both trust `environment:prod`. So the rule is per job: every job with `id-token: write` installs with `npm ci --ignore-scripts` (`.github/actions/setup` input `ignore-scripts: 'true'`), and every `uses:` in `.github/` is pinned to a full commit SHA with a `# vX.Y.Z` comment. esbuild and Rollup load their platform binaries from optionalDependencies, so synth and the Vite build work without install scripts. `infra/test/ci-workflows.test.ts` fails on a tag-pinned action, an install with scripts in an `id-token` job, or a deploy job that runs `cdk deploy` before `check:deployed-gsi`. To bump an action: `git ls-remote https://github.com/<owner>/<repo> refs/tags/<tag> 'refs/tags/<tag>^{}'` and use the peeled (`^{}`) SHA when there is one.
     - **Nightly / workflow_dispatch drift:** `cdk drift --fail` with the **read-only drift role**; concurrency group `cdk-drift`, separate from deploy (sharing `cdk-prod` would let a queued drift run cancel a pending deploy). `scripts/ci/prod-stack-activity.sh` skips drift while any `*-prod` stack is `*_IN_PROGRESS`, and discards a failing result (warning, no alert) if a stack was updated while drift ran. SNS alert on failure uses SSM `alerts-topic-arn`. Check recent scheduled runs: `gh run list --workflow cdk.yml --event schedule --limit 5`.

Prod only — there is no staging environment.

### Deploy alerts

Both workflows publish to the Guardrails alerts topic (SSM `alerts-topic-arn`) with the read-only drift role in environment `prod`. That role already trusts `environment:prod`, reads SSM through `ReadOnlyAccess` and may publish to the topic, so neither needs an IAM change. Neither runs npm.

- **Red main or failed deploy** (`.github/workflows/main-ci-alert.yml`): runs on every completed CI, Mobile and CDK run. A credential-free `Decide` job runs `scripts/ci/main-alert-decision.sh`; only when it says `alert=true` does the `Alert on red main` job take the drift role and publish.
  - Alerts: CI or Mobile `failure` / `timed_out` / `startup_failure` on a `push` to `main` (subject `gagnechris main is red: ...`), and CDK runs triggered by CI (`workflow_run`) on `main` that end the same way (subject `gagnechris prod deploy failed: ...`).
  - Never alerts: `cancelled` (a late run replaced by a newer one), `skipped` (CDK after a PR's CI or after a red CI), PR branches, scheduled CDK drift (it alerts by itself) and dispatched CDK runs.
  - Test the publish path: `gh workflow run main-ci-alert.yml -f simulate=CDK` sends a `[test] gagnechris prod deploy failed` email. It only publishes; nothing deploys.
- **Deploy lag** (`.github/workflows/deploy-lag-alert.yml`): hourly at `:23`, plus `workflow_dispatch`. It checks out `main`, reads SSM `deployed-sha`, and runs `scripts/ci/deploy-lag.sh <deployed> <main>`:
  - `deployed-sha` equals `main`, or is ahead of the checked-out `main` (a deploy finished mid-check): no alert.
  - Every undeployed change is docs-only per `scripts/ci/deploy-paths.sh`: no alert, however old. Docs-only merges never write `deployed-sha`.
  - Otherwise the age is the committer (merge) time of the oldest undeployed first-parent commit that `deploy-paths.sh` would deploy. It alerts (`gagnechris prod is behind main`) once that is over 2 hours. Late CI delivery and a normal deploy fit well inside that.
  - `deployed-sha` missing, unknown to the repository, or not an ancestor of `main`: alerts immediately. The plan job's rollback check refuses every deploy in that state, so prod cannot catch up by itself.
  - If the check itself fails (for example an SSM error), it publishes `gagnechris deploy lag check failed`.
  - It re-alerts every hour until prod catches up. To fix: open the CDK runs on `main` (`gh run list --workflow cdk.yml --branch main --limit 10`), re-run the failed one, or `gh workflow run cdk.yml -f mode=deploy`.
  - Check it live: `gh workflow run deploy-lag-alert.yml` (expect a green run, `alert=false` in the log while prod is current), or `gh workflow run deploy-lag-alert.yml -f test_alert=true` to also email a `[test]` copy of the current result.

## DNS and TLS

- Hosted zone for `gagnechris.com` is **looked up** (never recreated).
- Registration nameservers must match the zone (`aws route53domains get-domain-detail`).
- Apex/www → the public distribution; `admin.` and `notebook.` (A + AAAA) → their own distributions; iCloud TXT/DKIM and a soft DMARC record (`p=none`) in `Dns-prod`; no MX records.
- ACM certs in **us-east-1** via `Certificate-prod` (DNS validation; CloudFormation writes the validation CNAMEs into the zone): `SiteCertificateV2` (apex + www), `AuthCertificate` (`auth.gagnechris.com`) and `AppHostsCertificate` (`admin.gagnechris.com` + `notebook.gagnechris.com`). Separate certs avoid replacing one when another changes (cross-stack export).
- DNSSEC is not enabled (cost).

```bash
export ALERTS_EMAIL='you@example.com'
AWS_PROFILE=gagnechris-admin npm run cdk -- deploy Dns-prod Certificate-prod --require-approval never
```

## Static site

- Private S3 + CloudFront (OAC) in `Site-prod`.
- Security headers (HSTS, CSP for GA4 only), viewer-request function (www→apex with query string; old app URLs → 301 with `Cache-Control: max-age=86400`, matched case-insensitively and percent-decoded: `/admin/notebook*` → `https://notebook.gagnechris.com/*` and other `/admin*` → `https://admin.gagnechris.com/*`, both keeping the query, `/auth*` → `https://notebook.gagnechris.com/` with the query dropped; `/.well-known/*` is never redirected; `/blog*` → 301 `/posts*`; `/posts*` → `/blog` S3 prefix; the exact pages `/blog`, `/projects`, `/resume`, `/contact`, `/dont-feed-the-bears`, `/dont-feed-the-bears/camp`, `/dont-feed-the-bears/wild` → `{path}/index.html`; `/blog/<slug>` and `/projects/<slug>` → `{path}/index.html` when the KVS lists them; every other extensionless or `.html` URL → `/404.html` with the request's validators dropped. CloudFront never runs viewer-response on an origin 4xx, so a page URL that reached S3 without an object would be raw XML), viewer-response on the S3 default behavior only (force HTTP 404 when serving `/404.html`), `/assets/*` and `/fonts/*` on `AssetsCachePolicy` (one-year edge TTL, no viewer functions, so a missing file is S3's 404), `/api/*` (HTTP API origin from SSM `http-api-id`), `/media/*`.
- Custom domains: apex and www only (no staging alias).
- No distribution-wide custom error pages (so `/api` and `/assets` keep real 403/404). Bucket policy grants CloudFront `s3:ListBucket` for proper 404s. Publisher writes `blog/slugs.json` and syncs published post slugs (bare keys plus `__synced__`) and projects with a page (`projects/<slug>` plus `projects/__synced__`) into the one CloudFront KeyValueStore after each rebuild (function code stays CDK-managed). Until a namespace's sentinel exists its slugs fail open; `republishAll` writes both. To check: `aws cloudfront-keyvaluestore list-keys --kvs-arn <blog-slugs-kvs-arn>`.
- 5xx alarm publishes to the Guardrails alerts topic.

Smoke the old app URLs (status, `location`, `cache-control`):

```bash
for p in '/admin' '/admin/posts?tab=meta' '/admin/notebook' '/admin/notebook/today?date=2026-10-03' '/ADMIN/Notebook/notes/x' '/auth/callback?code=c&state=s' '/.well-known/apple-app-site-association'; do
  printf '%s  ' "$p"
  curl -sS -o /dev/null -w '%{http_code} %{redirect_url}  ' "https://gagnechris.com$p"
  curl -sSI "https://gagnechris.com$p" | tr -d '\r' | grep -i '^cache-control' || echo
done
# Expect 301 to admin./notebook. with the path (query dropped for /auth*) and
# cache-control: max-age=86400; 200 and no redirect for /.well-known.
```

```bash
export ALERTS_EMAIL='you@example.com'
AWS_PROFILE=gagnechris-admin npm run cdk -- deploy Guardrails-prod Site-prod --require-approval never
```

### App hosts (`admin.gagnechris.com`, `notebook.gagnechris.com`)

- Two `AppHost` constructs in `Site-prod`, one distribution each on `AppHostsCertificate`. Each has its own private, versioned bucket (access logs under `s3-admin/` / `s3-notebook/`, CloudFront logs under `cloudfront-admin/` / `cloudfront-notebook/` in `AccessLogs`), no AWS Backup (build output only).
- Behaviours: default (`HtmlCachePolicy`) and `/assets/*` (`AssetsCachePolicy`) from the host's bucket, `/api/*` to the HTTP API (same as the apex, `api-security-headers`). Admin also serves `/media/*` from the **site** bucket, so the site bucket policy grants the admin distribution `GetObject` and `ListBucket`.
- Response headers: `gagnechris-prod-admin-app-security-headers` / `gagnechris-prod-notebook-app-security-headers`. Same base CSP as the apex plus `script-src 'self'`, `img-src 'self' data:` (+ `https://gagnechris.com` on admin, for the Home and Resume preview images), `connect-src 'self'` + Cognito (+ the site bucket's regional host on admin, for presigned media PUTs). No Google hosts. HSTS (preload), nosniff, `X-Frame-Options: DENY`, `strict-origin-when-cross-origin`. The site bucket CORS allows only `https://admin.gagnechris.com`, for those PUTs.
- Viewer-request `gagnechris-prod-app-viewer-request` (`infra/lib/cloudfront/app-viewer-request.js`, no KVS): `/api`, `/assets`, `/media`, `/.well-known` and any path whose last segment has a dot pass through; everything else → `/index.html`. No distribution-wide error pages.
- Content is the admin and Notebook builds (`apps/web/dist-admin/`, `dist-notebook/`), shipped by `scripts/deploy-web.sh` (see Web deploy pipeline). On first create, CDK wrote a placeholder `index.html` (no script) to each bucket so the host answered 200 before the first app deploy. It never runs again, so web deploys are not overwritten.
- 5xx alarms `gagnechris-prod-admin-cloudfront-5xx`, `gagnechris-prod-notebook-cloudfront-5xx`.
- SSM: `admin-site-bucket-name`, `admin-cloudfront-distribution-id`, `notebook-site-bucket-name`, `notebook-cloudfront-distribution-id`.

Smoke (headers only):

```bash
for h in admin notebook; do
  curl -sI "https://$h.gagnechris.com/" | grep -iE '^(HTTP|content-security-policy|strict-transport-security)'
  curl -sS "https://$h.gagnechris.com/api/health"; echo
done
# Expect: 200, CSP with script-src 'self' and no google hosts, {"status":"ok",...}
```

AASA: each host serves its own `/.well-known/apple-app-site-association` (app ID `FF9YB7FZ7A.com.gagnechris.mobile`). Devices read it from Apple's CDN, which caches it for hours, so an AASA change reaches iPhones only after the CDN refetches; reinstalling the app doesn't help before then. Compare what the host and Apple serve:

```bash
curl -sS https://notebook.gagnechris.com/.well-known/apple-app-site-association
curl -sS https://app-site-association.cdn-apple.com/a/v1/notebook.gagnechris.com
curl -sS https://app-site-association.cdn-apple.com/a/v1/gagnechris.com
# Expect the same JSON from the host and the CDN; the notebook one has applinks and webcredentials.
```

## Web deploy pipeline

On merge to `main`, in the same `CDK + web deploy (main)` job and after `cdk deploy --all`, CI runs `scripts/deploy-web.sh`. **Prod only**. It reads everything from SSM under `/gagnechris/prod/`: `site-bucket-name`, `cloudfront-distribution-id`, `admin-site-bucket-name`, `admin-cloudfront-distribution-id`, `notebook-site-bucket-name`, `notebook-cloudfront-distribution-id`, `cognito-user-pool-id`, `cognito-admin-web-client-id`, `cognito-notebook-web-client-id`, `cognito-auth-domain` and `publisher-function-name`. The deploy role (`gagnechris-prod-gha-deploy`, `AdministratorAccess`) covers the syncs, invalidations and SSM reads.

1. `npm run build -w @gagnechris/web` builds all three apps; `check:web-shells` must pass before anything uploads.
2. Admin and Notebook: `assets/` (immutable cache), then `sync --delete` (excluding `assets/*`) to the host's bucket, `.well-known/*` as `application/json`, `manifest.json` as `application/manifest+json`, and a `/*` invalidation on that host's distribution.
3. Public: `assets/`, then `fonts/*.woff2` (both immutable cache), then the apex `sync --delete`, `.well-known/*`, and a `/*` invalidation.
4. Publisher `{"action":"republishAll"}` (SSM `publisher-function-name`) so pages pick up the new HTML shell. The publisher also regenerates `/resume.pdf` from the published resume singleton via pdf-lib when that item is published.

The apex sync never deletes publisher-owned keys (the patterns in `scripts/publisher-owned-paths.generated.txt`), admin `media/*`, the reserved `notebook/*`, hashed `assets/*` or hashed `fonts/*.woff2`. It deletes every other key the public build doesn't produce. The bucket is versioned, so a deleted key's previous version stays restorable for 90 days.

Manual / local:

```bash
AWS_PROFILE=gagnechris-admin npm run deploy:web
```

## HTTP API

`Api-prod`: HTTP API + Lambda. CloudFront `/api/*` is defined on **Site-prod** (SSM `http-api-id`) for the apex and both app hosts. Cognito JWT on `/api/admin/*` and `/api/notebook/*`, one authorizer per prefix (see **Cognito auth**). Posts and Notebook share the `Data-prod` table (`DATA_TABLE_NAME`) with different key prefixes (`docs/data-model.md`).

Site depends on Api so `/api` origin updates when the HttpApi is replaced. First-time bootstrap (circular SSM) is documented under **First-time / disaster-recovery bootstrap** above.

SSM: `/gagnechris/prod/http-api-id`, `http-api-url`.

Privacy (details in `docs/architecture.md`): notebook search is `POST` so terms stay out of CloudFront logs (`AccessLogs` bucket, 90 days) and API Gateway access logs; `/api/*` has the `api-security-headers` response headers policy; the Lambda sets `nosniff` and `no-store`. The default `execute-api` endpoint stays enabled because CloudFront uses it as the `/api/*` origin (accepted risk: JWT, admin group and throttles still apply).

Publisher IAM: read-only on the table (`GetItem` / `BatchGetItem` with `dynamodb:LeadingKeys` `POST#*`, `HOME#*`, `RESUME#*`, `PROJECT#*`; `Query` on `gsi1` for `STATUS#published` and `PROJECT_STATUS#published`). `infra/test/publisher-iam.test.ts` evaluates the synthesized policy: project rows and the two published partitions are readable, `USER#…`, `CONTACT#…`, slug claims and draft partitions are not. A new publisher read outside those partitions fails with AccessDenied until the policy in `publisher-stack.ts` is widened.

## DynamoDB data plane

`Data-prod`: on-demand single table `gagnechris-prod` (PITR, deletion protection, `RETAIN`, Streams `NEW_AND_OLD_IMAGES`). Schema (keys + GSIs + billing + stream + TTL attribute) lives in `@gagnechris/data` `APP_TABLE` and is shared with `scripts/local/bootstrap-table.ts` (creates with stream spec, adds missing GSIs, documents TTL). Key design: `docs/data-model.md`.

**GSI updates (one index per deploy):** CloudFormation allows at most one GSI create or delete per table update. Key-schema or projection changes count as delete + create and must be split across deploys.

CI enforces this two ways:

1. **Offline:** `assertAppTableGsiUpdateSafe(LAST_DEPLOYED_GSIS)` runs in DataStack synth and in `@gagnechris/data` unit tests. `LAST_DEPLOYED_GSIS` is **independent** of `APP_TABLE` — a PR may add one GSI to `APP_TABLE` without bumping the baseline.
2. **Live (deploy job; also PR CDK diff as an early warning):** `npm run check:deployed-gsi` `DescribeTable`s `gagnechris-prod` and compares to `APP_TABLE`, so bumping `LAST_DEPLOYED_GSIS` in the same PR cannot hide a multi-GSI change. The deploy job runs it right before `cdk deploy` and stops on failure, so the guard holds even though `CDK diff (PR)` is not a required check.

**Projection:** `projectionType` (and, for `INCLUDE`, `nonKeyAttributes`) in `APP_TABLE` reach both `DataStack` and the local bootstrap through `gsiProjection()`. Every deployed index is `ALL`. `INCLUDE` without attributes, or attributes on `ALL` / `KEYS_ONLY`, fails synth. Changing `nonKeyAttributes` on an existing index counts as delete + create.

### Notebook / multi-index rollout

When Notebook (or any feature) needs several new indexes:

1. Add **one** GSI to `APP_TABLE` (and attribute defs / local bootstrap follow automatically).
2. Open a PR. Unit tests + `check:deployed-gsi` must pass (exactly one create vs deployed).
3. Merge; wait for `Data-prod` deploy to finish.
4. Bump `LAST_DEPLOYED_GSIS` in `@gagnechris/data` to match `APP_TABLE` (names, key attributes, **and** projection) in a follow-up commit/PR (or the next index PR).
5. Repeat for each additional index. Never add two GSIs (or delete one and create another) in the same deploy.

Sparse **gsi3** (`syncPk` / `syncSk`, projection ALL) is deployed. `LAST_DEPLOYED_GSIS` lags `APP_TABLE` by at most one intentional create.

### Backups beyond PITR

In addition to DynamoDB PITR (35 days, same-region):

- **AWS Backup** vault `gagnechris-prod-app-table` with a daily plan (`07:00 UTC`) and a rolling **7-day** retention (`DeleteAfterDays=7`); older recovery points expire automatically.
- **Vault lock is governance mode** (`MinRetentionDays=7`, `MaxRetentionDays=35`, no `ChangeableForDays`). It stops recovery points being deleted or shortened below 7 days, but an admin can change or remove it (`aws backup delete-backup-vault-lock-configuration`). Never add `changeableFor` in CDK: that is compliance mode, which becomes permanent when its window ends.
- **Advanced DynamoDB backup is on** (account and Region setting `ResourceTypeManagementPreference.DynamoDB: true`, not in CDK). With it, AWS Backup owns the DynamoDB recovery points: they are encrypted with the vault key (the AWS-managed `aws/backup` key), and the vault lock and the 7-day lifecycle apply to them. If it is turned off, new backups are DynamoDB-managed again: encrypted with the table's key and deletable with `dynamodb:DeleteBackup`, outside the vault lock. CDK has no resource for it, so the daily restore-test check reads it and alarms (`gagnechris-prod-backup-advanced-dynamodb-off`). To turn it back on (admin, ask first): `aws backup update-region-settings --resource-type-opt-in-preference DynamoDB=true --resource-type-management-preference DynamoDB=true`.
- **Alerts:** EventBridge rule `gagnechris-prod-backup-job-failures` sends Backup, restore and copy jobs that end `FAILED`, `ABORTED`, `EXPIRED` or `PARTIAL` to the Guardrails topic. The pattern has one `$or` branch per event type because their fields differ: backup events report `state` with `backupVaultArn`, copy events report `state` with only `sourceBackupVaultArn` / `destinationBackupVaultArn`, and restore events report `status` (not `state`) and may carry no vault ARN. The restore branch matches on `status` alone, so a failed or aborted AWS Backup restore of any table in the account alerts, including restore tests and manual vault restores. A backup that never starts sends no event; `gagnechris-prod-backup-recovery-point-stale` covers that (see [Weekly restore testing](#weekly-restore-testing)).
- **Off-site copy: not enabled.** PITR and AWS Backup are both same-account, same-region. A cross-region copy needs a copy rule and a second vault (advanced DynamoDB backup, which copies require, is already on); for a table this small storage is pennies a month, but it adds a second vault to manage. If the account itself is the risk, a separate backup account matters more than a second region.
- Site bucket: versioning on + lifecycle expires noncurrent versions after 90 days.

Verify (read-only):

```bash
AWS_PROFILE=gagnechris-readonly aws backup describe-backup-vault \
  --backup-vault-name gagnechris-prod-app-table --region us-east-1
# Governance: no LockDate. A LockDate means compliance mode with that deadline.
AWS_PROFILE=gagnechris-readonly aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name gagnechris-prod-app-table --region us-east-1 \
  --query 'RecoveryPoints[].[CreationDate,Status,Lifecycle.DeleteAfterDays,EncryptionKeyArn]'
# Advanced DynamoDB backup: must print true
AWS_PROFILE=gagnechris-readonly aws backup describe-region-settings --region us-east-1 \
  --query ResourceTypeManagementPreference.DynamoDB
```

Restore proof is the weekly restore testing plan below; manual restores use the PITR rehearsal workflow or the "Restore my notes" steps.

### Weekly restore testing

AWS Backup restore testing proves the vault restores, with content checks, and cleans up after itself. All of it is in `Data-prod` (`infra/lib/constructs/restore-testing.ts`):

- **Plan** `gagnechris_prod_app_table_weekly`: Sundays `09:00 UTC` (starts within 1 h), latest `SNAPSHOT` recovery point from `gagnechris-prod-app-table` created in the last 2 days (the daily backup runs at `07:00 UTC`).
- **Selection** `app_table`: only `gagnechris-prod`, restored with role `gagnechris-prod-restore-testing` (AWS-managed `AWSBackupServiceRolePolicyForRestores`, which restore testing requires). Its trust allows `backup.amazonaws.com` with `StringEqualsIfExists` on `aws:SourceAccount`: AWS Backup does not document sending that key when it assumes a restore role, and a strict `StringEquals` would fail every restore test if it does not. AWS Backup names the table `awsbackup-restore-test-<random>`, with deletion protection off and the default (AWS-owned) encryption key. That is restore testing's inferred metadata for DynamoDB. It is a scratch copy that lives for a few hours, so it is not overridden.
- **Validation window: 4 h.** AWS Backup deletes the restored table once a validation result is reported or the window closes, whatever the result. DynamoDB has no tag-on-restore, so AWS deletes it by its `awsbackup-restore-test-` name. Never rename it.
- **Validator** Lambda `gagnechris-prod-restore-test` (Go: `go/cmd/restore-test`, `go/internal/restoretest`), triggered by rule `gagnechris-prod-restore-test-validate` (`Restore Job State Change`, `status` `COMPLETED`, `resourceType` `DynamoDB`). The rule has no plan filter because AWS does not document where the event carries the plan ARN. The validator calls `DescribeRestoreJob` first and ignores any job whose `CreatedBy.RestoreTestingPlanArn` is not this plan (for example a manual vault restore from [Restore my notes](#restore-my-notes-item-level-copy-back)): it logs the job id and never reports a validation result for it. It scans the restored table and checks that the table is not empty, every item has string `pk`/`sk`, every item with a schema-checked `entityType` (`RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES`) matches the JSON Schema generated from its `@gagnechris/data` zod schema (`go/internal/contract/contract.json`; zod refinements such as real calendar dates and link schemes have no JSON Schema form and are not checked) and sits under the key the key builders produce, and `HOME#current`/`RESUME#current` META exist. It then applies the **count floor**, and calls `PutRestoreValidationResult` with `SUCCESSFUL` or `FAILED`. Messages and logs carry keys, schema paths and counts only, never content. A scan error is reported as `FAILED` rather than retried.
- **Count floor:** for each type with a timestamp (post, home, resume, contact, note, task), the restore must hold at least `ceil(0.9 × N)` rows, where N is the number of `gagnechris-prod` rows of that type whose `createdAt` or `updatedAt` is at least 5 minutes before the recovery point's creation date (`DescribeRestoreJob` → `RecoveryPointCreationDate`). Those rows provably existed when the backup was taken, so rows created or edited since, and tombstones purged since, never count against the restore, and a near-empty table cannot fail it (N = 0 needs 0). At small counts the floor is exact (1 → 1, 3 → 3; 10 → 9). It can only false-fail if rows with old timestamps were written after the backup (a copy-back `create` keeps the source `createdAt`, or a bulk import); re-run after the next backup. N comes from `Scan` with `Select: COUNT`, one per type: no item is returned. A restore job without a recovery point date fails the test. Daily claims have no timestamps and are not floored.
- **Validator IAM:** `dynamodb:Scan`/`DescribeTable` on `table/awsbackup-restore-test-*`, `DescribeTable` on `table/gagnechris-*-restore-*`, `ListTables`; on `gagnechris-prod` only `dynamodb:Scan` with `dynamodb:Select = COUNT` and `dynamodb:Attributes` limited to `pk`, `sk`, `entityType`, `createdAt`, `updatedAt` (so even a filter cannot touch note text); `backup:PutRestoreValidationResult`, `DescribeRestoreJob`, `ListRestoreJobs`, `DescribeRegionSettings`, `ListRecoveryPointsByBackupVault` (this vault) and `GetRestoreTestingPlan` (this plan).
- **Event log:** rule `gagnechris-prod-restore-job-event-log` sends every `aws.backup` `Restore Job State Change` event to log group `/aws/events/gagnechris-prod-restore-job-events` (7-day retention). Events hold job ids, ARNs and statuses, no table content. Use them to see the real event shape when changing a pattern; the rule patterns are tested against `infra/test/fixtures/backup-events`.
- **Daily check:** the same Lambda runs daily at `12:00 UTC` (rule `gagnechris-prod-restore-leftover-check`). AWS Backup sends no event when nothing happens (no backup job, no eligible recovery point for the restore test, or a validate rule that never matches, after which the scratch table is deleted with no validation status), so the check asks AWS Backup what last succeeded. It emits:
  - `LeftoverRestoreTables`: tables named `awsbackup-restore-test-*`, `gagnechris-<env>-restore-*` or `gagnechris-<env>-backup-restore-*` older than 24 h. Each one is a full copy of prod, private notes included, with no deletion protection, PITR, Backup or alarms.
  - `StaleRecoveryPoint` (0/1): the newest `COMPLETED` recovery point of `gagnechris-prod` in the vault is 26 h old or there is none.
  - `RestoreValidationMissing` (0/1): no restore job of the plan has `ValidationStatus` `SUCCESSFUL` in the last 8 days. A plan less than 8 days old is exempt until its first run; a deleted plan counts as missing.
  - `AdvancedDynamoDbBackupDisabled` (0/1): the Region setting above is off.
  - `BackupCheckCompleted` (1), last, so a check that throws part-way emits no heartbeat.
- **Alarms → Guardrails topic:** `gagnechris-prod-restore-validation-failed` (content check or count floor failed), `gagnechris-prod-restore-validation-missing`, `gagnechris-prod-backup-recovery-point-stale`, `gagnechris-prod-backup-advanced-dynamodb-off`, `gagnechris-prod-restore-leftover-tables` (these four re-alert daily until fixed), `gagnechris-prod-backup-check-not-running` (no `BackupCheckCompleted` for two 1-day periods; missing data breaches, with a 2-day warm-up after it is created), `gagnechris-prod-restore-test-lambda-errors` / `-throttles`, and `gagnechris-prod-backup-job-failures`, which also matches every AWS Backup restore job that ends `FAILED` or `ABORTED` (the restore job end states besides `COMPLETED`). The missing-success alarm is computed by the Lambda rather than as a missing-`RestoreValidationSucceeded` CloudWatch alarm because CloudWatch alarms cannot look back more than 7 days.

Verify (read-only):

```bash
export AWS_PROFILE=gagnechris-readonly AWS_REGION=us-east-1
aws backup get-restore-testing-plan --restore-testing-plan-name gagnechris_prod_app_table_weekly
PLAN_ARN=$(aws backup get-restore-testing-plan --restore-testing-plan-name gagnechris_prod_app_table_weekly \
  --query 'RestoreTestingPlan.RestoreTestingPlanArn' --output text)
# Last runs: Status COMPLETED, ValidationStatus SUCCESSFUL, DeletionStatus SUCCESSFUL
aws backup list-restore-jobs --by-restore-testing-plan-arn "$PLAN_ARN" \
  --query 'RestoreJobs[].[CreationDate,Status,ValidationStatus,ValidationStatusMessage,DeletionStatus,CreatedResourceArn]'
# Leftover scratch tables: must print []
aws dynamodb list-tables \
  --query "TableNames[?starts_with(@, 'awsbackup-restore-test-') || contains(@, '-restore-')]"
```

Run the daily check on demand (needs `lambda:InvokeFunction`): `aws lambda invoke --function-name gagnechris-prod-restore-test --cli-binary-format raw-in-base64-out --payload '{"action":"leftoverCheck"}' /tmp/leftover.json && cat /tmp/leftover.json`. The output has `leftovers` and `freshness` (`recoveryPointAgeHours`, `validationAgeDays` and the three flags).

On `restore-validation-failed`: read the job's `ValidationStatusMessage` (command above) and the `/aws/lambda/gagnechris-prod-restore-test` logs. The scratch table is already being deleted. A `<type> count X below floor Y` problem means the restore lost rows that existed at the backup; anything else is a schema or key problem. Fix the data or the validator, and record the outcome in the Linear ticket. On `restore-leftover-tables`: check the table's tags (`purpose`, `created-by`), then `aws dynamodb delete-table --table-name <name>` (admin).

On `restore-validation-missing`: `list-restore-jobs` (above) shows whether the plan ran. No job: check the plan exists and that the vault has a recovery point from the last 2 days. A job with an empty `ValidationStatus`: the validate rule or the Lambda did not run (check its logs, the rule and the event log above); re-run it by hand (below) if the scratch table still exists.

#### Re-run a missed restore-test validation

When a restore-test job is `COMPLETED` but its `ValidationStatus` is still `VALIDATING` or empty, invoke the validator with a synthetic event for that job (needs `lambda:InvokeFunction`). It must run before the validation window ends: the selection's `ValidationWindowHours` (4 h, `RESTORE_TEST_VALIDATION_WINDOW_HOURS` in `infra/lib/constructs/restore-testing.ts`; live value from `aws backup get-restore-testing-selection --restore-testing-plan-name gagnechris_prod_app_table_weekly --restore-testing-selection-name app_table`) after the job's `CompletionDate`. After that AWS Backup deletes the scratch table, and the job keeps an empty validation status.

```bash
export AWS_REGION=us-east-1
# Job id and scratch table ARN: the list-restore-jobs command above, or
aws backup describe-restore-job --restore-job-id <id> \
  --query '[Status,CompletionDate,ValidationStatus,CreatedResourceArn,CreatedBy.RestoreTestingPlanArn]'
aws lambda invoke --function-name gagnechris-prod-restore-test --cli-binary-format raw-in-base64-out \
  --payload '{"version":"0","detail-type":"Restore Job State Change","source":"aws.backup","detail":{"restoreJobId":"<id>","status":"COMPLETED","resourceType":"DynamoDB","createdResourceArn":"<scratch table arn>"}}' \
  out.json && cat out.json
```

`out.json` has `kind: "validation"` and the `result`; `describe-restore-job` then shows the `ValidationStatus`. A validation status can be set only once per job. `kind: "ignored"` means the job is not from the restore testing plan. On `backup-recovery-point-stale`: `aws backup list-backup-jobs --by-resource-arn <table arn>` for failed or missing jobs, and that the plan and selection exist. On `backup-check-not-running`: the daily check is failing or not scheduled; read the Lambda logs and errors alarm.

### Manual PITR rehearsal (scratch table)

Actions → **PITR restore rehearsal** (`pitr-rehearsal.yml`; manual only, one run at a time) runs `scripts/rehearse-pitr-restore.sh`:

- It fixes the restore point once, up front (`LatestRestorableDateTime`), and restores `gagnechris-prod` to `gagnechris-prod-restore-<stamp>` at that time with `--sse-specification-override Enabled=true,SSEType=KMS`. That is the AWS-managed `aws/dynamodb` key, the same as prod (`TableEncryption.AWS_MANAGED`). Without the override a PITR restore keeps the source's encryption, but the override makes it explicit and the script checks `SSEType=KMS`.
- It tags the scratch table `purpose=restore-rehearsal`, `created-by`, `source-table`, `restore-date-time` and `keep`.
- It verifies content that was stable at the restore point. It samples up to 25 rows whose `updatedAt` is at least 60 s older than the restore point, and each must exist in the restore with the same `version` and `updatedAt`. It also checks that the singleton rows exist and the table is not empty. There is no live-count compare, so autosaves and TTL expiry during the run cannot fail it. It reads keys, `version` and `updatedAt` only, and prints counts only.
- A `trap` deletes the scratch table on **every** exit (success, mismatch, ACTIVE timeout, cancel), waiting for `ACTIVE` first because a restoring table cannot be deleted. With `keep_target=1` the table is kept and tagged `keep=true`, and the leftover alarm fires after 24 h. Delete it by hand.
- `force_failure=1` fails after verification, to prove the cleanup.

It runs with role `gagnechris-prod-gha-pitr-rehearsal` (`CiDeployRole-prod`, repo variable `AWS_PITR_REHEARSAL_ROLE_ARN`; the workflow fails if the variable is unset), never the deploy role. The role trusts only the `prod` environment. On `gagnechris-prod` it may only `DescribeContinuousBackups`, `RestoreTableToPointInTime`, and `Scan` with `Select: SPECIFIC_ATTRIBUTES` over `pk`, `sk`, `version`, `updatedAt` (the script's projection). On `gagnechris-prod-restore-*` it has the item read/write a PITR restore needs plus `DescribeTable`, `TagResource` and `DeleteTable`. It has no other permissions.

### Restore my notes (item-level copy-back)

Use this for the realistic single-user case: notes or tasks deleted or overwritten by mistake. The live table is never swapped. Restore a scratch copy from before the damage, then copy the selected rows back with a version bump, so the web app and iOS sync pick them up like any edit.

1. **Owner id** (Cognito `sub`; it is the `USER#<sub>#…` key segment):

   ```bash
   export AWS_REGION=us-east-1
   POOL=$(aws ssm get-parameter --name /gagnechris/prod/cognito-user-pool-id --query Parameter.Value --output text)
   aws cognito-idp list-users --user-pool-id "$POOL" \
     --query "Users[].[Username,Attributes[?Name=='sub']|[0].Value]"
   ```

2. **Scratch restore** from before the damage (admin profile). Use PITR, which goes back 35 days to the second:

   ```bash
   export AWS_PROFILE=gagnechris-admin AWS_REGION=us-east-1
   AT=2026-10-03T09:00:00Z                       # just before the damage (UTC)
   SCRATCH=gagnechris-prod-restore-$(date -u +%Y%m%d%H%M)
   aws dynamodb restore-table-to-point-in-time \
     --source-table-name gagnechris-prod --target-table-name "$SCRATCH" \
     --restore-date-time "$AT" --sse-specification-override Enabled=true,SSEType=KMS
   until [ "$(aws dynamodb describe-table --table-name "$SCRATCH" --query Table.TableStatus --output text)" = ACTIVE ]; do sleep 15; done
   aws dynamodb tag-resource --resource-arn "$(aws dynamodb describe-table --table-name "$SCRATCH" --query Table.TableArn --output text)" \
     --tags Key=purpose,Value=restore-my-notes Key=created-by,Value="$USER"
   ```

   Or use the Backup vault (daily, 7 days), for example when PITR is unavailable:

   ```bash
   RP_ARN=$(aws backup list-recovery-points-by-backup-vault --backup-vault-name gagnechris-prod-app-table \
     --query 'max_by(RecoveryPoints,&CreationDate).RecoveryPointArn' --output text)   # or pick by CreationDate
   ROLE_ARN=$(aws iam get-role --role-name gagnechris-prod-restore-testing --query Role.Arn --output text)
   aws backup start-restore-job --recovery-point-arn "$RP_ARN" --iam-role-arn "$ROLE_ARN" \
     --metadata TargetTableName="$SCRATCH"
   aws backup describe-restore-job --restore-job-id <id> --query '[Status,CreatedResourceArn]'
   ```

3. **Dry run** (the default; it reads only and prints one line per row: action, id, source vs live version/updatedAt, new version). Add `--show-titles` to see titles. They are private, so do not paste them into tickets.

   ```bash
   npx tsx scripts/restore-copy-back.ts --source "$SCRATCH" --target gagnechris-prod \
     --owner "$SUB" --types note,task            # optionally --ids <id>,<id>
   ```

   | Action                | Meaning                                                                                                                |
   | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
   | `create`              | Live row is gone (purged tombstone): written with `source.version + 1` (see the note below the table)                  |
   | `undelete`            | Live row is a tombstone: written live again with `tombstone.version + 1`                                               |
   | `overwrite`           | Live row differs: written with `live.version + 1`                                                                      |
   | `skip-target-newer`   | Live row changed after the restore point. Pass `--overwrite-newer` to replace it, which is the "overwritten note" case |
   | `skip-identical`      | Nothing to do                                                                                                          |
   | `skip-daily-taken`    | Another live daily note now holds that day; merge by hand                                                              |
   | `skip-source-deleted` | Already deleted at the restore point; pick an earlier `AT`                                                             |
   | warning on a task     | Its linked note will not be live; restore the note too (`--ids`)                                                       |

   A `create` cannot know the purged tombstone's version, so `source.version + 1` can be lower than a tombstone a client still caches, and that client keeps the row deleted (`packages/app-core` keeps the higher version). Tombstones are purged 30 days after delete and client caches are in memory only, so this only affects an app session that has been open since before the purge. Reloading the web app or restarting the iOS app clears it.

4. **Apply:** re-run with `--apply` (admin profile). Each row is one transaction: the META row, rebuilt with the shared builders (list GSIs, sync `syncSk` at the copy-back time, `createHash` kept and hashed if it is a plaintext value, no `ttl`), plus the owner create claim and, for daily notes, the day claim when it is free. Every write is conditional on the live version read during the plan, so an edit made in between shows as `conflict` (exit 2) and is never overwritten; re-run the dry run. The script refuses any target other than `gagnechris-prod` / `gagnechris-local`, a source equal to the target, and a live table as the source.

5. **Check** the notes in the app (clients pick them up on the next sync poll). Then **delete the scratch table** and confirm nothing is left:

   ```bash
   aws dynamodb delete-table --table-name "$SCRATCH"
   AWS_PROFILE=gagnechris-readonly aws dynamodb list-tables \
     --query "TableNames[?starts_with(@, 'awsbackup-restore-test-') || contains(@, '-restore-')]"   # []
   ```

Rehearsed against DynamoDB Local (`services/api/test/integration/copy-back.integration.test.ts`, which covers delete, overwrite, a purged row, a re-taken day, a task without its note, and a conflict) and with the CLI on `gagnechris-local`. Record each prod run in the Linear ticket.

### Full-table disaster recovery (stop and ask Chris first)

`gagnechris-prod` has a fixed name, `RETAIN` and deletion protection. Api and Publisher get its name, ARN and **stream ARN** through CloudFormation cross-stack exports (`api-stack.ts` / `publisher-stack.ts` take `dataTable`). So you cannot point consumers at another table: CloudFormation will not change an export that another stack imports, and SSM is not what they read. A restored table also starts with **no stream** (the publisher would stop), no TTL, no PITR, no deletion protection, no Backup selection, no tags and no alarms.

**Recover into the CDK-managed table instead of swapping it:**

1. Stop writers: stop using the admin app and iOS. Throttling the API (for example reserved concurrency 0) is a break-glass change: ask first and record it in the Linear ticket.
2. Restore a scratch copy from before the damage (step 2 above).
3. Notebook rows: run the copy-back for the owner with `--types note,task --overwrite-newer`. Dry run first, then `--apply`.
4. CMS rows (`POST#`, `SLUG#`, `TAG#`, `PROJECT#`, `PROJECT_SLUG#`, `HOME#`, `RESUME#`, `CONTACT#`) have no versioned clients, so copy them back raw. Review the dry count first, and do not copy `RATE#`, `SYNC#` or `CREATED#` rows:

   ```bash
   aws dynamodb scan --table-name "$SCRATCH" --output json \
     | jq -c '[.Items[] | select(.pk.S | test("^(POST|SLUG|TAG|PROJECT|PROJECT_SLUG|HOME|RESUME|CONTACT)#"))]
              | . as $all | range(0; length; 25) | $all[.:(. + 25)]
              | {"gagnechris-prod": [ .[] | {PutRequest: {Item: .}} ]}' > /tmp/cms-batches.jsonl
   wc -l /tmp/cms-batches.jsonl     # batches of 25
   while read -r batch; do
     aws dynamodb batch-write-item --request-items "$batch" --query 'UnprocessedItems' ; done < /tmp/cms-batches.jsonl
   ```

   `PUBLISHED` writes hit the stream and the publisher rebuilds the site. Finish with the manual `republishAll` (Publisher section).

5. Delete the scratch table and run the leftover check.

If the table itself is gone (only possible after someone removed deletion protection), restore the PITR or vault backup as a scratch table, then re-create `gagnechris-prod` through CDK, not by restoring under the live name. The stack's state, stream export and alarms must come from CloudFormation; see **Adopting existing resources (`cdk import`)** and plan it with Chris. Then copy back as above. Neither full-table path has been rehearsed in prod.

### Notebook human export

Distinct from PITR / AWS Backup: the **Export** button on the Notebook's Notes page downloads a client-built ZIP (`notebook-export-YYYY-MM-DD.zip`) by paging `GET /api/notebook/notes` and `GET /api/notebook/tasks` while signed in.

Archive layout:

- `notes/daily/*.md` and `notes/pages/*.md` — one Markdown file per non-deleted note (YAML frontmatter: `id`, `area`, `type`, `date`, `title`, `pinned`, `tags`, `updatedAt`; every string is double-quoted, so any YAML parser reads it back unchanged); task embeds are written as described in `docs/data-model.md` (Task embeds)
- `tasks.json` — all non-deleted tasks
- `README.md` — short description of the archive

**Use this for:** personal backup, migration into another markdown editor, offline reading.

**Do not use this for:** restoring the DynamoDB table. There is no import-from-export path that rebuilds `gagnechris-prod`. Table recovery is a scratch restore plus copy-back (**Restore my notes** / **Full-table disaster recovery** above).

### createHash migration

`scripts/migrate-create-hash.mjs` finds rows whose `createHash` holds plaintext note/task text instead of a hash. It rewrites live META values to `sha256:<hex>` (what the API computes, so replays still match) and removes `createHash` from tombstones and create claims. It prints counts only, and writes are conditional on the old value.

```bash
AWS_PROFILE=gagnechris-readonly node scripts/migrate-create-hash.mjs           # dry run: counts
AWS_PROFILE=<deploy/admin profile> node scripts/migrate-create-hash.mjs --apply
AWS_PROFILE=gagnechris-readonly node scripts/migrate-create-hash.mjs --verify  # exit 2 if any remain
```

PITR (35 days) and AWS Backup recovery points keep any plaintext values until their retention expires, and restored copies from before a migration run contain them too.

### Resume date migration

`scripts/migrate-resume-dates.ts` moves experience dates out of `company` (`Ro | July 2019 - Present`) into `start`/`end` (`YYYY-MM`, `null` = present) on `RESUME#current` `META` and `PUBLISHED`. It prints keys, versions, company names and parsed dates, never bullets or the summary. It only accepts a line that re-renders identically; anything else is reported as `unparseable` and left as stored, to fix in admin. Both rows are written in one transaction, each conditional on the version it read; each version goes up by one, META gets a new `updatedAt`, and `PUBLISHED` keeps its `updatedAt`/`publishedAt` (the PDF dates are pinned to them). The write triggers a publisher rebuild whose HTML and PDF are byte-identical, so nothing is uploaded or invalidated. Re-running `--apply` is a no-op.

```bash
AWS_PROFILE=gagnechris-admin npx tsx scripts/migrate-resume-dates.ts           # dry run
AWS_PROFILE=gagnechris-admin npx tsx scripts/migrate-resume-dates.ts --apply   # exit 1: raced an admin save, re-run
AWS_PROFILE=gagnechris-admin npx tsx scripts/migrate-resume-dates.ts --verify  # exit 2 while anything is unmigrated
```

The table is `--table`, else `DATA_TABLE_NAME`, else `gagnechris-prod`; `AWS_ENDPOINT_URL_DYNAMODB` points it at DynamoDB Local.

### Task start-date migration

`scripts/migrate-task-start-dates.ts` finds task META rows stored without a `startDate` attribute, sets `startDate` to their `dueDate` (or `null`) and `someday` to `false`, and moves dated rows' GSI1 sort key from `DUE#<date>#TASK#<id>` to `START#<date>#TASK#<id>`. The API already reads these rows that way, but its Today and Upcoming queries read only `START#` keys, so an unmigrated dated row is missing from those lists until this runs. `version`, `updatedAt` and the sync feed are untouched. Each write is conditional on the version it read and on `startDate` still being absent, so an API save in between wins. It prints one JSON line of counts (`scanned`, `tasks`, `alreadyMigrated`, `pending`, `pendingDated`, `pendingUndated`, `pendingTombstones`, `written`, `conflicts`), never ids or task text. Run `--verify` on any table that may hold rows written before `startDate` existed, such as a restore from an old backup; exit 0 means none are left. Re-running `--apply` is a no-op.

```bash
AWS_PROFILE=gagnechris-readonly npx tsx scripts/migrate-task-start-dates.ts           # dry run: counts
AWS_PROFILE=gagnechris-admin npx tsx scripts/migrate-task-start-dates.ts --apply      # exit 1: raced an API save, re-run
AWS_PROFILE=gagnechris-readonly npx tsx scripts/migrate-task-start-dates.ts --verify  # exit 2 while anything is unmigrated
```

The table is `--table`, else `DATA_TABLE_NAME`, else `gagnechris-prod`; `AWS_ENDPOINT_URL_DYNAMODB` points it at DynamoDB Local.

### Orphaned daily-note claims

`scripts/scan-orphan-daily-claims.mjs` counts daily-note claims (`USER#…#DAILY#<area>#<date>`) whose holder note META row is missing or a tombstone. The API frees these on the next create of that day, so they are harmless once deployed; the script cleans them up ahead of time. It only runs against `gagnechris-prod` or `gagnechris-local` (`DATA_TABLE_NAME`, default prod) and prints counts only (`claims`, `live`, `holderMissing`, `holderDeleted`, `malformed`, `released`, `conditionFailed`), never ids, dates or content. `--apply` deletes each orphaned claim conditional on its `noteId` being unchanged.

```bash
AWS_PROFILE=gagnechris-readonly node scripts/scan-orphan-daily-claims.mjs           # dry run: counts
AWS_PROFILE=<deploy/admin profile> node scripts/scan-orphan-daily-claims.mjs --apply
AWS_PROFILE=gagnechris-readonly node scripts/scan-orphan-daily-claims.mjs --verify  # exit 2 if any remain
```

`conditionFailed > 0` on `--apply` (exit 1) means a claim changed mid-run; re-run it. `malformed` claims (no `userId` or `noteId`) are counted but never touched.

SSM: `/gagnechris/prod/data-table-name`, `data-table-arn`, `data-table-stream-arn`.

Legacy post import: `docs/migrate-posts.md` (`npm run migrate:posts`).

Media uploads: admin `POST /api/admin/media/upload-url` returns a
presigned PUT for `media/*` on the site bucket; CloudFront serves `/media/*`
with a long cache. Paste/drop images in the post editor inserts
`![alt](/media/...)`.

## Transactional email / SES

`Email-prod`: SES domain identity for `gagnechris.com` (DKIM + MAIL FROM
`bounce.gagnechris.com`), plus an email identity for `ALERTS_EMAIL` so sandbox
can deliver to that inbox. SPF on the apex includes `amazonses.com`. Soft DMARC
(`p=none`) is published; there is no receiving MX.

`Api-prod` public routes (served by the Go function `gagnechris-prod-api-go`):

- `POST /api/contact` — contact form (persists `CONTACT#<ulid>` first; honeypot `hp_field`; 3/IP/hour + global SES daily cap)
- `POST /api/resume/download` — anonymous resume-download notify (IP/day dedupe; shared SES daily cap)

Notify inbox = `ALERTS_EMAIL`. From = `noreply@gagnechris.com`. SES sandbox is ~200/day; app cap is 100/day.

### Leave the SES sandbox (one-time)

Until production access is granted, SES only delivers to verified addresses
(the `ALERTS_EMAIL` identity). Request production access:

```bash
# See AWS docs for put-account-details fields; use the inbox from your private note.
aws sesv2 put-account-details --profile gagnechris-admin --region us-east-1 \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url https://gagnechris.com \
  --use-case-description 'Contact form and resume download notifications for personal site'
```

Verify DKIM / identity status:

```bash
AWS_PROFILE=gagnechris-readonly aws sesv2 get-email-identity \
  --email-identity gagnechris.com --region us-east-1 \
  --query '{Verified:VerifiedForSendingStatus,Dkim:DkimAttributes.Status}'
```

Smoke contact (after deploy + DNS):

```bash
curl -sS -X POST https://gagnechris.com/api/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke","email":"you@example.com","message":"smoke test","hp_field":"","formStartedAt":0}'
```

```bash
export ALERTS_EMAIL='you@example.com'
AWS_PROFILE=gagnechris-admin npm run cdk -- deploy Data-prod --require-approval never
```

## Publisher

`Publisher-prod`: DynamoDB Streams (PUBLISHED filter) → Lambda → writes `blog/<slug>/index.html`, `blog/index.html`, `blog/posts.json`, `projects/index.html`, `projects/<slug>/index.html`, `sitemap.xml`, `rss.xml`, then invalidates those CloudFront paths. Shared `NodeLambda` construct (`infra/lib/constructs/node-lambda.ts`) owns bundling defaults, log retention and Powertools env; errors/throttles alarms come from `lambda-guardrails.ts`, which `GoLambda` uses too.

**Alarms** (Guardrails SNS): API `HandlerError` / `DataIntegrityError` / `SyncAdapterMissing` (a sync row type with no registered adapter; the feed returns 500 until `services/api/src/sync/adapters.ts` lists it), `SyncCorruptRow` (the sync feed skipped a row that failed to parse; the warning log `Skipping corrupt stored item` names its `pk`/`sk`; fix the row through the API or a script that writes a newer `updatedAt` and `syncSk` so clients pick it up), publisher `DataIntegrityError`, resume-pdf, kvs-sync and `RebuildUnsettled` (a rebuild gave up after 4 passes while publishes kept landing; invoke `{"action":"republishAll"}` if the site looks stale), API Gateway `5xx`, DynamoDB AppTable `SystemErrors` / `ThrottledRequests`. Handled API 500s do not increment Lambda Errors.

Notebook ops alarms:

- `api-write-conflict-spike`: `WriteConflict` (every 409 or 412) ≥ 20 in 15 minutes. One stale tab is normal; a burst means autosave or sync is fighting itself.
- `api-latency-p95`: API Gateway p95 latency ≥ 3 s for three 5-minute periods.

4xx responses aren't alarmed: unauthenticated 401s from scanners would make them noise.

To test alert delivery, set an alarm to ALARM with the admin profile, for example `aws cloudwatch set-alarm-state --alarm-name gagnechris-prod-api-lambda-throttles --state-value ALARM --state-reason 'alert test'`. The alerts address gets the email, and the alarm resets on its next evaluation. Repeat after any change to the Guardrails topic or subscription.

Site resources (bucket, distribution ID, blog-slugs KVS ARN) come from SSM — Publisher does not import Site CloudFormation exports. Deploy Publisher after Site so those parameters exist. Dns still imports Site's distribution for Route 53 aliases.

After stream retries (`retryAttempts: 3`), discarded records go to SQS
`gagnechris-prod-publisher-stream-failures` (on-failure destination). The depth
alarm watches `NumberOfMessagesSent` (Sum ≥ 1) so each new failure re-notifies;
`ApproximateNumberOfMessagesVisible` would stay ALARM until purge and mute
follow-up alerts for up to 14 days.

### Stream DLQ recovery

Stream DLQ messages hold only failure metadata (not the DynamoDB item payload).
Stream records themselves expire after ~24h, so replaying the queue is not enough.

On DLQ alarm:

1. Invoke republish-all (rebuilds site from the table — preferred recovery).
2. Purge the failure queue (`gagnechris-prod-publisher-stream-failures`).

There is no live forced-failure test (throw from the deployed handler, publish,
confirm a DLQ message and an alert): it would mean deploying a broken publisher
to prod. Coverage instead:

- Synth tests pin the on-failure destination, `retryAttempts: 3` and the depth
  alarm's SNS action.
- The alert path is the one the alarm-state test under Alarms exercises.

Manual republish-all (after shell deploy, or recovery):

```bash
AWS_PROFILE=gagnechris-readonly aws lambda invoke \
  --function-name "$(aws ssm get-parameter --name /gagnechris/prod/publisher-function-name --query Parameter.Value --output text)" \
  --cli-binary-format raw-in-base64-out \
  --payload '{"action":"republishAll"}' \
  /tmp/publisher-out.json && cat /tmp/publisher-out.json
```

SSM: `/gagnechris/prod/publisher-function-name`, `publisher-function-arn`.

```bash
export ALERTS_EMAIL='you@example.com'
AWS_PROFILE=gagnechris-admin npm run cdk -- deploy Publisher-prod --require-approval never
```

## Cognito auth

`Auth-prod`: single-admin user pool (self sign-up off), passkeys as primary sign-in with optional TOTP for password fallback (Cognito forbids MFA=REQUIRED with WebAuthn first-factor), managed login at `auth.gagnechris.com`, public `admin-web` / `notebook-web` / `ios` / `dev-local` clients (authorization code + PKCE), each with its own managed login branding. Those four are the only clients in the pool.

SSM: `/gagnechris/prod/cognito-user-pool-id`, `cognito-admin-web-client-id`, `cognito-notebook-web-client-id`, `cognito-ios-client-id`, `cognito-dev-client-id`, `cognito-auth-domain`.

### Groups and clients

- Groups: `site-admin` (CMS, `/api/admin/*`), `notebook` (`/api/notebook/*`) and `user-admin` (managing users, `/api/admin/users*`). CDK creates all three and adds `ADMIN_USERNAME` (GitHub repo variable; defaults to `ALERTS_EMAIL`) to each, making that user a Full Admin. If that user doesn't exist, the Auth stack update fails and rolls back, and nothing is enforced. The Lambda checks the token's client and `cognito:groups` per prefix (`docs/architecture.md`, Auth); any other pool user gets 403.
- Users are managed in Admin under **Settings › Users & access** (`/settings/users`), which calls `/api/admin/users*` (`docs/architecture.md`, Users and access). Removing someone never deletes their Cognito user or Notebook; don't delete pool users by hand either, since a deleted user's Notebook data is orphaned under a `sub` nobody can sign in as. Invite emails come from the Cognito default sender, which has a low daily limit.
- An ID token minted before you joined a group has no such entry in `cognito:groups`. The API client refreshes the token and retries once on 403. If it still shows 403, sign out and back in.
- API Gateway has two JWT authorizers on the pool issuer: `CognitoJwtAdmin` on `/api/admin*` (audience `admin-web`) and `CognitoJwtNotebook` on `/api/notebook*` (audiences `notebook-web` and `ios`). The Lambda gets `ADMIN_WEB_CLIENT_ID`, `NOTEBOOK_WEB_CLIENT_ID` and `IOS_CLIENT_ID`, which Api reads from SSM (not Auth exports).
- The `ios` client trusts only `https://notebook.gagnechris.com/ios/auth/callback` and `/ios/auth/signed-out`, plus `gagnechris://auth/callback` and `gagnechris://` until the app's sign-in uses the https callback. `admin-web` trusts only `https://admin.gagnechris.com/auth/callback` and `https://admin.gagnechris.com/`; `notebook-web` only the same paths on `notebook.gagnechris.com`. Prod CORS (API + site bucket) has no localhost origins.
- `dev-local` client: localhost:5173, :5174 and :5175 callbacks only, for exercising managed login from local Vite. No API authorizer lists it as an audience, so its tokens can't call prod admin or notebook routes. Local CMS work uses `npm run local:dev` (fake auth).

### Orphan / leftover user pools

The only pool in the account should be the stack pool (SSM `cognito-user-pool-id`). Check with the readonly profile:

```bash
aws cognito-idp list-user-pools --max-results 20 --profile gagnechris-readonly --region us-east-1
```

If another pool shows up, **ask Chris before deleting or importing it.** Confirm it isn't owned by a live stack first: `aws cloudformation describe-stack-resources --physical-resource-id <pool-id>`.

Never run `update-user-pool` against the live pool to flip one setting: it resets every attribute you don't pass. Change the live pool through CDK only.

Deploy (after Certificate has the `auth` SAN):

```bash
export ALERTS_EMAIL='you@example.com'
AWS_PROFILE=gagnechris-admin npm run cdk -- deploy Certificate-prod Auth-prod --require-approval never
```

Create the admin user (never the console). Use your private-note email:

```bash
POOL_ID=$(aws ssm get-parameter --name /gagnechris/prod/cognito-user-pool-id --query Parameter.Value --output text --profile gagnechris-admin)
ADMIN_EMAIL='you@example.com'   # from private note

aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --profile gagnechris-admin

# Set a temporary password, then sign in at ManagedLoginUrl (stack output) and enroll a passkey.
aws cognito-idp admin-set-user-password \
  --user-pool-id "$POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --password 'REPLACE_WITH_STRONG_TEMP_PASSWORD' \
  --permanent \
  --profile gagnechris-admin
```

Sign-in URL is the `ManagedLoginUrl` output on `Auth-prod` (the `admin-web` client; or `https://auth.gagnechris.com/login?client_id=...&response_type=code&scope=openid+email+profile&redirect_uri=https://<admin|notebook>.gagnechris.com/auth/callback` with that host's client ID).

## Admin and Notebook apps

- CMS: `https://admin.gagnechris.com` (Posts at `/`, `/home`, `/resume`). Notebook: `https://notebook.gagnechris.com` (`/` opens Today; `/notes`, `/tasks`). There is no public login link.
- Each app signs in with its own Cognito client through managed login (`signInWithRedirect`, auth code + PKCE) and returns to the page that started sign-in. Opening the second app within an hour of signing in to the first is silent; after that it asks once, then stays signed in for 30 days.
- Tokens are in that origin's `localStorage` (`CognitoIdentityServiceProvider.<clientId>.*`). API calls send the **ID token** (`aud` = that app's client).
- **Sign out** on one app revokes that app's refresh token and ends the managed-login session; the other app stays signed in.
- `deploy-web.sh` bakes the client IDs in from SSM (`VITE_COGNITO_ADMIN_CLIENT_ID`, `VITE_COGNITO_NOTEBOOK_CLIENT_ID`). Local: copy `apps/web/.env.example` to `.env.local` (both use `dev-local`).

**Notebook on iPhone (PWA):** the manifest is scoped to `notebook.gagnechris.com/`, so an icon installed from the apex can't move. To install:

1. Delete the old Notebook Home Screen icon.
2. Open `https://notebook.gagnechris.com` in Safari.
3. Share → Add to Home Screen.
4. Open the new icon and sign in once (standalone apps keep their own storage).

**Old apex URLs:** `https://gagnechris.com/admin*` and `/auth*` 301 to the app hosts (see Static site). The apex serves no signed-in page and holds no tokens: the public bundle deletes `CognitoIdentityServiceProvider.*` keys from apex `localStorage` and expires matching cookies on `Domain=gagnechris.com` and host-only.

**If sign-in or the hosts misbehave:**

- A browser that cached a bad 301 holds it for at most 24 hours (`max-age=86400`); clearing site data for `gagnechris.com` drops it sooner.
- `DNS_PROBE_FINISHED_NXDOMAIN` on a host that resolves elsewhere is a stale negative cache in Chrome: clear it at `chrome://net-internals/#dns`.
- No access screen right after joining a group: the app refreshes the token once on load; if it still shows, sign out of that app and back in (see Groups and clients).
- Signed out unexpectedly on one app: sign in again there. Each app keeps its own refresh token, so the other app is unaffected.
- There is no fallback to an apex app: the apex has no Cognito client. Fix a broken app host forward, or revert that app's change.

## HTTP API runtime and contract

`Api-prod`: HTTP API + arm64 Node.js 24 Lambda (1024 MB, X-Ray active tracing) behind CloudFront `/api/*`. Cognito JWT authorizers on `/api/admin/*` and `/api/notebook/*`. Public `GET /api/health`.

OpenAPI contract: `packages/shared/openapi/openapi.json`, client types
`packages/api-client/src/schema.d.ts` and Go types `go/internal/apitypes/apitypes.gen.go`.
Regenerate all three with `npm run openapi`; CI runs `npm run openapi:check` and
`npm run go:generate:check` and fails on drift.

```bash
export ALERTS_EMAIL='you@example.com'
AWS_PROFILE=gagnechris-admin npm run cdk -- deploy Api-prod Site-prod --require-approval never
```

Smoke:

```bash
curl -sS https://gagnechris.com/api/health
# Expect: {"status":"ok","service":"gagnechris-api"}

curl -sS -o /dev/null -w "%{http_code}\n" https://gagnechris.com/api/admin/me
# Expect: 401 without Authorization header
```

### Cold starts

The first request on a new instance logs `bundleReadyMs` on its `request` line: milliseconds from process start until the bundle (Node) or the router (Go) was ready. The REPORT line's Init Duration minus that is Lambda runtime and sandbox time, which no bundle change shrinks.

Per-route report (cold-start ratio, init p50/p95, cold and warm handler p50/p95, all routes and DynamoDB routes, per memory size):

```bash
AWS_PROFILE=gagnechris-readonly AWS_REGION=us-east-1 npx tsx scripts/api-cold-start-report.ts --days 14
# or --since 2026-10-07T00:00:00Z to start at a deploy
# --function gagnechris-prod-api-go for the Go API
```

It runs this Logs Insights query on the function's log group (`aws lambda get-function-configuration --function-name gagnechris-prod-api --query LoggingConfig.LogGroup`) and aggregates the rows:

```
filter @type = "REPORT" or message = "request"
| fields coalesce(@requestId, function_request_id) as invocation
| stats earliest(route) as apiRoute, max(@initDuration) as initMs, max(@duration) as durationMs, max(@memorySize / 1000 / 1000) as memoryMb, max(bundleReadyMs) as loadMs, count(*) as lineCount by invocation
| filter lineCount = 2
```

Bundle load time, with and without `--enable-source-maps` (median of fresh Node processes; `--docker` uses the Lambda Node.js 24 image with a CPU cap):

```bash
npx tsx scripts/measure-api-init.ts --docker --cpus 0.58 --runs 40
```

## Local E2E

For API + publisher without touching prod DynamoDB or CloudFront, see **[docs/local-e2e.md](../docs/local-e2e.md)**. Day-to-day admin: `npm run local:dev`. Smoke: `npm run e2e:local`.

## iOS release (TestFlight)

The iOS app ships only through TestFlight; there is no public App Store listing. `.github/workflows/ios-release.yml` runs on a pushed `ios-v*` tag (or by hand from Actions): it runs the mobile checks, then `eas build --platform ios --profile production --non-interactive --auto-submit`, so EAS builds and signs in the cloud and submits the build to App Store Connect. EAS owns the build number (`autoIncrement`, `appVersionSource: "remote"` in `apps/mobile/eas.json`). The EAS project is `@gagnechris/gagnechris-mobile`, linked by `expo.extra.eas.projectId` in `apps/mobile/app.json`; non-interactive builds fail without it.

**One-time setup**

1. App Store Connect: an app record for bundle ID `com.gagnechris.mobile` (needed for TestFlight even without a listing). Fill in only what TestFlight asks for: name, beta description, a privacy policy URL (external testing requires one; the site has no privacy page yet), and export compliance (standard HTTPS only; `app.json` sets `ITSAppUsesNonExemptEncryption` to false, so builds skip the question).
2. Put the record's Apple ID (the number under App Information) in `apps/mobile/eas.json` as `submit.production.ios.ascAppId`. It is not secret. The workflow stops with a message until it is set.
3. App Store Connect API key (Users and Access → Integrations, App Manager role): upload it to EAS with `npx eas-cli credentials --platform ios` (App Store Connect API Key → add), so it never leaves EAS. Never put the `.p8` in the repo, Linear or a GitHub secret.
4. Expo access token (expo.dev → Account settings → Access tokens, a robot user if you prefer): add it as `EXPO_TOKEN` in a GitHub environment named `testflight` (Settings → Environments), which the release job uses. Restrict the environment to tags `ios-v*` if you like.

**Release**

```bash
git tag ios-v1.0.0 && git push origin ios-v1.0.0
```

The job takes about as long as the EAS build (20 to 40 minutes). App Store Connect processes the build for a few more minutes before TestFlight offers it.

**Testers**

- Internal testers (App Store Connect users on the team, up to 100) get each build as soon as it is processed, with no review. Add them under TestFlight → Internal Testing.
- External testers (email or public link) need Beta App Review for each new version. The reviewer needs a demo account: create a Notebook-only test user and a site-admin test user in the Cognito user pool, and give their sign-in details only in App Store Connect's Beta App Review Information, never in the repo or Linear.
- Builds expire 90 days after upload. Tag a release at least monthly so testers always have a live build.

## Existing resources (CDK decisions)

| Resource                                  | Decision                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| Route 53 hosted zone for the site domain  | **Look up** in CDK (`HostedZone.fromLookup`). Do not recreate.          |
| Other Route 53 zones outside this project | **Leave alone.**                                                        |
| Existing ACM certs for the site domain    | Managed by `Certificate-prod`.                                          |
| Legacy IAM users                          | No access keys after bootstrap; disable/delete when SSO-only is enough. |
| `CDKToolkit` in us-east-1                 | Created by bootstrap.                                                   |

## Agent notes

- Prefer SSO profiles once configured. Do not recreate an account-level Identity Center instance.
- Do not put account IDs, org IDs, portal URLs, emails, or access-key IDs in this public repo.
