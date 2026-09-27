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
2. `aws budgets describe-budgets --account-id "$CDK_DEFAULT_ACCOUNT" --profile gagnechris-readonly`
3. Optional test: publish to the alerts topic ARN from the stack outputs.

Optional override without relying on the CLI: `export CDK_ACCOUNT=...`

### Adopting existing resources (`cdk import`)

If CloudFormation reports a resource already exists, **do not delete it by hand**. Prefer:

1. `cdk import StackName` (or add the resource to the template with the same physical name and import), or
2. Retain the live resource and adopt it via lookup (`fromLookup` / `from*Attributes`) when CDK already supports that pattern (e.g. hosted zones).

Ask before any production change that is not a stack deploy.

## GitHub Actions OIDC (CHR-19)

CI assumes short-lived roles (no AWS keys in GitHub).

1. Deploy the role stack once (laptop admin), then set repo variables:

```bash
export ALERTS_EMAIL='you@example.com'
AWS_PROFILE=gagnechris-admin npm run cdk -- deploy CiDeployRole-prod --require-approval never

# Copy ARNs from stack outputs, then:
gh variable set AWS_DEPLOY_ROLE_ARN --body 'arn:aws:iam::ACCOUNT:role/gagnechris-prod-gha-deploy'
gh variable set AWS_DIFF_ROLE_ARN --body 'arn:aws:iam::ACCOUNT:role/gagnechris-prod-gha-diff'
gh variable set ALERTS_EMAIL --body "$ALERTS_EMAIL"
```

2. Lock the GitHub `prod` environment to `main` only (CHR-60):

```bash
bash scripts/apply-github-environments.sh
```

3. Workflows (`.github/workflows/cdk.yml`):
   - **PR:** `cdk synth` + `cdk diff` (diff role); posts a sticky PR comment
   - **main / workflow_dispatch deploy:** `cdk deploy --all` (deploy role, `prod` environment; concurrency does not cancel in-flight deploys)
   - **Nightly / workflow_dispatch drift:** `cdk drift --fail` (separate concurrency group); SNS alert on failure

Prod only — there is no staging environment.

## DNS and TLS (CHR-21)

- Hosted zone for `gagnechris.com` is **looked up** (never recreated).
- Registration nameservers must match the zone (`aws route53domains get-domain-detail`).
- Apex/www → CloudFront aliases (CHR-25 cutover); iCloud TXT/DKIM in `Dns-prod` (MX/DMARC deferred — CHR-63).
- ACM site cert (`SiteCertificateV2`: apex + www) and a separate auth cert (`auth.gagnechris.com`) in **us-east-1** via `Certificate-prod` (DNS validation). Separate certs avoid replacing one when the other changes (cross-stack export).
- DNSSEC deferred (cost).

```bash
export ALERTS_EMAIL='you@example.com'
AWS_PROFILE=gagnechris-admin npm run cdk -- deploy Dns-prod Certificate-prod --require-approval never
```

## Static site (CHR-22)

- Private S3 + CloudFront (OAC) in `Site-prod`.
- Security headers (HSTS, CSP for GA4 + Formspree + Cognito auth domain / IdP), viewer-request function (www→apex with query string; `/blog/*`, `/resume`, `/contact` → Option B `{path}/index.html`; other extensionless routes → SPA `/index.html`), `/assets/*` long cache, reserved `/api/*` and `/media/*`.
- Custom domains: apex and www only (no staging alias).
- No distribution-wide custom error pages (so `/api` and `/assets` keep real 403/404). Bucket policy grants CloudFront `s3:ListBucket` for proper 404s.
- 5xx alarm publishes to the Guardrails alerts topic.

```bash
export ALERTS_EMAIL='you@example.com'
AWS_PROFILE=gagnechris-admin npm run cdk -- deploy Guardrails-prod Site-prod --require-approval never
```

## Web deploy pipeline (CHR-23)

On merge to `main`, after CDK deploy, CI builds `apps/web`, syncs to the Site bucket (SSM `/gagnechris/prod/site-bucket-name`), and invalidates CloudFront (`/gagnechris/prod/cloudfront-distribution-id`). **Prod only**.

Publisher-owned paths are never deleted by the sync: `blog/*`, `media/*`, `sitemap.xml`, `rss.xml`. After sync + `/*` invalidation, deploy invokes the publisher with `{"action":"republishAll"}` (SSM `/gagnechris/prod/publisher-function-name`) so pages pick up the new HTML shell.

Manual / local:

```bash
AWS_PROFILE=gagnechris-admin npm run deploy:web
```

## HTTP API (CHR-28 / CHR-30)

`Api-prod`: HTTP API + Lambda behind CloudFront `/api/*`. Cognito JWT on `/api/admin/*` and `/api/notebook/*`. Posts CRUD uses the shared `Data-prod` table (`DATA_TABLE_NAME`); Notebook will share the same table with different key prefixes (`docs/data-model.md`).

SSM: `/gagnechris/prod/http-api-id`, `http-api-url`.

## DynamoDB data plane (CHR-29)

`Data-prod`: on-demand single table `gagnechris-prod` (PITR, deletion protection, `RETAIN`, Streams `NEW_AND_OLD_IMAGES`). GSIs `gsi1` (status lists) and `gsi2` (tags). Key design: `docs/data-model.md`.

SSM: `/gagnechris/prod/data-table-name`, `data-table-arn`, `data-table-stream-arn`.

Legacy post import (CHR-36): `docs/migrate-posts.md` (`npm run migrate:posts`).

Media uploads (CHR-31): admin `POST /api/admin/media/upload-url` returns a
presigned PUT for `media/*` on the site bucket; CloudFront serves `/media/*`
with a long cache. Paste/drop images in the post editor inserts
`![alt](/media/...)`.

```bash
export ALERTS_EMAIL='you@example.com'
AWS_PROFILE=gagnechris-admin npm run cdk -- deploy Data-prod --require-approval never
```

## Publisher (CHR-34)

`Publisher-prod`: DynamoDB Streams (META filter) → Lambda → writes `blog/<slug>/index.html`, `blog/index.html`, `blog/posts.json`, `sitemap.xml`, `rss.xml`, then invalidates those CloudFront paths. Errors alarm to the Guardrails alerts topic.

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

## Cognito auth (CHR-27)

`Auth-prod`: single-admin user pool (self sign-up off), passkeys as primary sign-in with optional TOTP for password fallback (Cognito forbids MFA=REQUIRED with WebAuthn first-factor), managed login at `auth.gagnechris.com`, public `web` / `ios` clients (authorization code + PKCE).

SSM: `/gagnechris/prod/cognito-user-pool-id`, `cognito-web-client-id`, `cognito-auth-domain`.

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

Sign-in URL is the `ManagedLoginUrl` output on `Auth-prod` (or `https://auth.gagnechris.com/login?client_id=...&response_type=code&scope=openid+email+profile&redirect_uri=https://gagnechris.com/auth/callback`).

## Admin shell (CHR-32)

SPA routes `/admin/*` (lazy-loaded) and `/auth/callback`. Cognito managed login via Amplify (`signInWithRedirect`, auth code + PKCE). Web build reads Cognito IDs from SSM in `scripts/deploy-web.sh` (`VITE_COGNITO_*`). Local: copy `apps/web/.env.example` to `.env.local`.

Reach admin by opening `https://gagnechris.com/admin` (no public login link). API calls send the Cognito **ID token** (HTTP API JWT `aud` = web client id).

## HTTP API (CHR-28)

`Api-prod`: HTTP API + arm64 Node.js 22 Lambda behind CloudFront `/api/*`. Cognito JWT authorizer on `/api/admin/*` and `/api/notebook/*`. Public `GET /api/health`.

OpenAPI contract: `packages/shared/openapi/openapi.json` (regenerate with `npm run openapi -w @gagnechris/shared`).

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

## Local E2E (CHR-75)

For API + publisher without touching prod DynamoDB or CloudFront, see **[docs/local-e2e.md](../docs/local-e2e.md)**. Day-to-day admin: `npm run local:dev`. Smoke: `npm run e2e:local`.

## Existing resources (CDK decisions)

| Resource | Decision |
| --- | --- |
| Route 53 hosted zone for the site domain | **Look up** in CDK (`HostedZone.fromLookup`). Do not recreate. |
| Other Route 53 zones outside this project | **Leave alone.** |
| Existing ACM certs for the site domain | **Replace via CDK** when the certificate stack lands; keep until cutover. |
| Legacy IAM users | No access keys after bootstrap; disable/delete when SSO-only is enough. |
| `CDKToolkit` in us-east-1 | Created by bootstrap. |

## Agent notes

- Prefer SSO profiles once configured. Do not recreate an account-level Identity Center instance.
- Do not put account IDs, org IDs, portal URLs, emails, or access-key IDs in this public repo.
