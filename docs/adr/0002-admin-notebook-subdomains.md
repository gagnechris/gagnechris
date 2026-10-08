# ADR 0002: Admin and Notebook subdomains

**Status:** Accepted (2026-10-03, Chris: `localStorage` for tokens; no sign-in fan-out)  
**Rollout:** four phases: infra, API, web, cutover (see §5, Order of deploys).  
**Context:** Cognito tokens, including the 30-day refresh token, are JS-readable cookies on `gagnechris.com` (`Domain=gagnechris.com`, path `/`, `apps/web/src/auth/config.ts`). Every public page runs `gtag.js` under `script-src 'unsafe-inline'`, so any script on a public page can read them. The strict CSP only covers `/admin*` and `/auth*`, and cookie path isn't a security boundary inside one origin.

**Hard constraints:** CDK only (no console). **No added sign-in friction** (Chris keeps password + passkey sign-in, MFA optional). Chris accepted one exception: an occasional extra sign-in per app (see §3). One PR per phase.

## Decision summary

| Area        | Decision                                                                                                                                                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CDN         | One CloudFront distribution per host. New `AppHost` construct used twice inside `SiteStack`, each with its own private S3 bucket, strict CSP policy, `/api/*` to the existing HTTP API, and one shared KVS-free viewer-request function. Public distribution unchanged until cutover.                                                    |
| Certificate | New ACM cert `AppHostsCertificate` (`admin.` + SAN `notebook.`) in `CertificateStack`. The existing site cert isn't touched.                                                                                                                                                                                                             |
| Builds      | One workspace (`apps/web`), three Vite build targets (`public`, `admin`, `notebook`) from one config, each with its own HTML, entry, `publicDir` and `outDir`. A Rollup `generateBundle` guard fails the public build if any admin, Notebook, auth or Amplify module is in it.                                                           |
| Auth        | Same pool and managed login (`auth.gagnechris.com`). New public clients `admin-web` and `notebook-web`, each with only its own host's callback and logout URLs. Tokens go in Amplify's default `localStorage`, which is per origin. No sign-in fan-out: each app signs in on its own (silent within the one-hour managed-login session). |
| API token   | The web keeps sending the **ID token** (`aud` = client ID). One JWT authorizer per prefix (`/api/admin*` → `admin-web`, `/api/notebook*` → `notebook-web`). The router re-checks client and group per prefix.                                                                                                                            |
| Groups      | `site-admin` → `/api/admin/*`, `notebook` → `/api/notebook/*`. Chris in both. Legacy `web` client + `admin` group are accepted on both prefixes only while `AUTH_LEGACY_WEB_CLIENT_ID` is set on the Lambda.                                                                                                                             |
| Cutover     | Parallel run first. Phase 3 (web) ships the new hosts and a clean public build, and leaves the **frozen legacy** `spa.html` serving `/admin*` on the apex. Phase 4 (cutover) then switches to 301s, deletes the legacy client and group, and removes leftover apex cookies.                                                              |

## 1. CDN layout

### Decision

- **Separate distributions** for `admin.gagnechris.com` and `notebook.gagnechris.com`. Both are built by one `AppHost` construct, instantiated twice **inside `SiteStack`**. The admin host needs a `/media/*` behaviour on the site bucket. Putting that distribution in another stack would make the site bucket policy (OAC `AWS:SourceArn`) depend on a stack that depends on Site, which is a cycle.
- **Buckets:** one private bucket per app host (SSE-S3, `BLOCK_ALL`, `enforceSSL`, versioned, noncurrent expiry, access logs to the existing `AccessLogs` bucket under `s3-admin/`, `s3-notebook/`). Build output only; no AWS Backup (it can be rebuilt from git).
  - The site bucket keeps public content, publisher output and `media/`.
  - The reserved `notebook/*` prefix (the private media plan) should move to the Notebook's own bucket or a dedicated private bucket when it's built. It must never sit under a distribution that serves the apex.
- **Behaviours per app distribution:**

  | Path pattern            | Origin                     | Cache                                               | Response headers                                              |
  | ----------------------- | -------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
  | default (`*`)           | app bucket (OAC)           | `HtmlCachePolicy` (5 min)                           | app strict policy                                             |
  | `/assets/*`             | app bucket                 | `AssetsCachePolicy` (immutable)                     | app strict policy                                             |
  | `/api/*`                | existing HTTP API (SSM id) | `CACHING_DISABLED`, `ALL_VIEWER_EXCEPT_HOST_HEADER` | existing `ApiSecurityHeaders` (shared; policies are reusable) |
  | `/media/*` (admin only) | **site** bucket (OAC)      | `MediaCachePolicy`                                  | admin strict policy                                           |

  Stored markdown keeps relative `/media/...` paths, so admin previews resolve same-origin and `img-src 'self'` is enough.

- **CSP (response headers policy per distribution).** Response headers policies attach to cache behaviours, and behaviours match on path only ([CloudFront: response headers policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html)). So a separate distribution is the only way to give a host its own policy without writing headers in function code. Base: today's `sharedCsp` plus:
  - admin: `script-src 'self'`; `img-src 'self' data:`; `connect-src 'self' https://auth.gagnechris.com https://cognito-idp.us-east-1.amazonaws.com https://<site bucket regional host>` (presigned media PUT);
  - notebook: same, without the bucket host;
  - both: `frame-ancestors 'none'`, HSTS (`includeSubDomains; preload`, already on the apex), nosniff, `X-Frame-Options: DENY`, `strict-origin-when-cross-origin`;
  - no Google hosts, no `'unsafe-inline'` for scripts.

  The CSP header value is limited to 1783 characters (same doc), and these values fit.

- **Viewer-request function:** one new `app-viewer-request.js` (JS 2.0, **no KVS**), shared by both app distributions. Functions are standalone resources that can be associated with any behaviour.
  - It passes `/api/*`, `/assets/*`, `/media/*`, `/.well-known/*` and any path whose last segment has a dot through unchanged.
  - Everything else is rewritten to `/index.html`.
  - No lowercase canonicalization: these hosts have one CSP for every path, so case variants can't change the policy. That logic exists on the apex only because `/admin*` is a case-sensitive behaviour there.
  - There is no distribution-wide `errorResponses`, for the same reason as today (they would rewrite `/api` 4xx into HTML).
- **CORS:** none needed for `/api` (same-origin per host). The site bucket's CORS `allowedOrigins` gains `https://admin.gagnechris.com` for presigned PUTs. The apex stays until cutover, then is dropped.
- **Invalidation:**
  - `deploy-web.sh` invalidates `/*` on each distribution it syncs.
  - The publisher keeps invalidating only the public distribution. App hosts hold no publisher output.
  - Media keys are unique per upload, so `/media/*` never needs invalidation.
- **Cost:** about $0 a month extra on pay-as-you-go.
  - There's no per-distribution charge ([CloudFront pay-as-you-go pricing](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/)). The always-free tier covers 1 TB out, 10M requests and 2M function invocations a month. **Unverified:** the page doesn't say whether that's per account or per distribution; it reads as per account.
  - Invalidations: first 1,000 paths a month free (same page). `/*` counts as one path, and there are at most three per deploy.
  - ACM public certs for integrated services are free ([ACM pricing](https://aws.amazon.com/certificate-manager/pricing/)).
  - Route 53 alias queries to CloudFront are free ([Route 53 pricing](https://aws.amazon.com/route53/pricing/)).
  - S3 storage for two small SPAs is pennies.
  - Flat-rate plans are priced **per distribution** ([CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)), so adopting one later would mean three plans.
- **Observability:** a 5xx alarm per app distribution (same shape as `CloudFront5xxAlarm`), and SSM params `adminSiteBucketName`, `adminDistributionId`, `notebookSiteBucketName`, `notebookDistributionId` for `deploy-web.sh`.
- **DNS:** A/AAAA aliases for both hosts in `DnsStack`, following the apex pattern (distribution passed in from `SiteStack`). CDK keeps DNS and distributions in lockstep, so no alias points at a deleted distribution (subdomain takeover).

### Rejected alternatives

| Option                                                                                   | Rejected because                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One distribution, all three hostnames, host-based routing in the viewer-request function | Behaviours and response headers policies can't vary by host. CSP would have to be written by a viewer-response function keyed on `Host`, and the S3 key rewritten per host. Security headers would move into code, one function bug would affect all hosts, and a mis-route could serve admin JS under the GA-enabled public policy (or the reverse). |
| Site bucket with `apps/admin/` and `apps/notebook/` prefixes plus origin paths           | The public distribution would also serve `gagnechris.com/apps/admin/index.html` under the public CSP, unless guarded. `deploy-web.sh`'s `--delete` deny-list would grow again. Separate buckets cost nothing and let each app deploy with a plain `sync --delete`.                                                                                    |
| New `AppHostsStack`                                                                      | The OAC bucket-policy statement for the admin `/media/*` behaviour must live with the site bucket. A separate stack creates a Site ↔ AppHosts cycle, or needs a wildcard `distribution/*` SourceArn.                                                                                                                                                  |
| Add `admin.`/`notebook.` SANs to `SiteCertificateV2`                                     | Changing SANs replaces the certificate, which breaks the cross-stack export (see the `CertificateStack` comment). A new certificate is free and independent.                                                                                                                                                                                          |
| CloudFront SaaS Manager / multi-tenant distribution                                      | Built for many tenants on one config. Two hosts don't need it, and tenant config adds a new service to operate.                                                                                                                                                                                                                                       |
| Reuse the apex viewer-request function on app hosts                                      | It carries the KVS blog allowlist, Option B rewrites and www logic, none of which apply. A small function is easier to test.                                                                                                                                                                                                                          |

## 2. Builds

### Decision

- **One workspace, three build targets.** `apps/web/vite.config.ts` becomes a factory selected by `WEB_APP=public|admin|notebook`. It uses an env var, not Vite `--mode`, so `.env.<mode>` loading and `import.meta.env.MODE` keep their meaning.

  | Target   | HTML / entry                              | `publicDir`                                                         | `outDir`         | Plugins                                                 |
  | -------- | ----------------------------------------- | ------------------------------------------------------------------- | ---------------- | ------------------------------------------------------- |
  | public   | `index.html` → `src/main.tsx` (GA)        | `public/` (minus manifest, icons, AASA after cutover)               | `dist/`          | static pages, sitemap, `_shell.html`, 404, bundle guard |
  | admin    | `admin.html` → `src/admin/main.tsx`       | `public-admin/` (favicon only)                                      | `dist-admin/`    | GA-free shell check                                     |
  | notebook | `notebook.html` → `src/notebook/main.tsx` | `public-notebook/` (`manifest.json`, `icons/`, `.well-known/` AASA) | `dist-notebook/` | GA-free shell check                                     |

  Each non-public build renames its HTML to `index.html` in its `outDir`. `npm run build` runs all three, and `npm run dev` starts public on 5173, admin on 5174 and notebook on 5175.

- **Source layout:**
  - `src/` (public pages);
  - `src/admin/` (CMS only);
  - `src/notebook/` (moved from `src/admin/notebook/`, routes without the `/admin/notebook` prefix);
  - `src/workspace/` for the signed-in shell both apps share: `auth/`, query provider, versioned-doc hooks, leave guard, lazy `MarkdownEditor`, admin CSS.

  Shared non-UI logic stays in `@gagnechris/app-core`, `@gagnechris/api-client` and `@gagnechris/shared`. Absolute `/admin…` links (about 25 today) become app-relative.

- **Boundaries:**
  - ESLint `no-restricted-imports` zones, so public code can't import `src/admin`, `src/notebook`, `src/workspace`, `aws-amplify` or `@gagnechris/app-core`, and admin and Notebook can't import each other.
  - **CI guard (the proof):** a `bundleBoundary` Vite plugin on the public target. In `generateBundle` it collects every chunk's `moduleIds` and fails the build on any match for `/apps/web/src/(admin|notebook|workspace|auth)/`, `/node_modules/(aws-amplify|@aws-amplify)/`, `/packages/app-core/`, or `/node_modules/@tanstack/react-query/`. The public build has no admin entry at all, so the whole output is the reachable graph and nothing is allow-listed.
  - A second check, `npm run check:web-shells`, fails if `dist-admin/index.html` or `dist-notebook/index.html` contains `googletagmanager`, `gtag` or any inline `<script>`, or if `dist/index.html` lost GA.
  - Both run in the existing **Lint, test, and build** job. A Vitest test drives the plugin against a fixture that imports a forbidden module, so the guard is revert-tested like `check:rn-bundles`.
- **Public bundle after the split:** no Amplify, no TanStack Query, no auth code. The public site never signs anyone in.
- **`scripts/deploy-web.sh` ships three shells:**
  - It reads the client IDs per app from SSM (`cognitoAdminWebClientId`, `cognitoNotebookWebClientId`).
  - It builds the three targets and syncs each app dir to its own bucket: `assets/` first (immutable cache-control), then `sync --delete` with no deny-list, `.well-known/*` as `application/json`, and `manifest.json` as `application/manifest+json`.
  - It invalidates each app distribution, then runs today's public flow unchanged (deny-list sync, invalidation, `republishAll`).
  - The publisher needs **no change**: it renders only from the public `_shell.html`.
- **Local and e2e:** the local stack and Playwright run three Vite servers on fixed ports with fake auth. The local API injects claims whose group and `aud` match the route prefix.

### Rejected alternatives

| Option                                            | Rejected because                                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite multi-page (one build, three HTML inputs)    | One `publicDir` and one `assets/` for all hosts. The Notebook manifest and AASA would land on every host, and each bucket would get every chunk unless the deploy pruned by manifest. The guard would have to walk the graph from one entry instead of checking a whole output.        |
| Separate workspaces `apps/admin`, `apps/notebook` | Needs `ui/`, `components/`, `lib/`, the markdown editor and admin CSS moved into packages first, plus three more tsconfig, ESLint and Vitest setups. The build-target split gets the same bundle isolation now, and `src/workspace/` is the seam to extract later if the apps diverge. |
| Keep one bundle and rely on lazy routes and CSP   | That's today's state. The tokens live on the public origin, which is the bug.                                                                                                                                                                                                          |
| Grep minified output for admin strings            | Fragile (minified names, false negatives). `moduleIds` from Rollup is exact.                                                                                                                                                                                                           |

## 3. Auth

### Decision

- **Same user pool, same managed-login domain** `auth.gagnechris.com`, same passkey RP ID ([ADR 0001](./0001-passkey-rp-id.md) is unaffected: passkey ceremonies always run on `auth.gagnechris.com`, whatever the client).
- **Two new public app clients** (auth code + PKCE, no secret, same token lifetimes and rotation as `web`). Each client registers **only its own host**:

  | Client         | Callback                                        | Logout                             |
  | -------------- | ----------------------------------------------- | ---------------------------------- |
  | `admin-web`    | `https://admin.gagnechris.com/auth/callback`    | `https://admin.gagnechris.com/`    |
  | `notebook-web` | `https://notebook.gagnechris.com/auth/callback` | `https://notebook.gagnechris.com/` |
  - Each client needs a `CfnManagedLoginBranding`, or managed login isn't available for it ("Managed login isn't available for an app client created with an AWS SDK until you create one with a CreateManagedLoginBranding request": [managed login](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html)).
  - `dev-local` gains callbacks for ports 5174 and 5175.
  - The legacy `web` client stays until the cutover phase's legacy removal.

- **Token storage: Amplify's default `localStorage`, not `CookieStorage`.** Drop the `setKeyValueStorage(new CookieStorage(...))` call in each app.
  - **Verified:** Amplify v6 `CookieStorage` with no `domain` writes host-only cookies. `@aws-amplify/core@6.19.1` `CookieStorage.getData()` passes `domain: undefined` to `js-cookie@3.0.8`, which skips falsy attributes (`if (!attributes[attributeName]) continue`). A cookie without `Domain` "is returned only to the host that sent it… not made available to subdomains" ([MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)). So host-only cookies would also meet the goal.
  - `localStorage` is still the better choice, for three reasons:
    1. It's scoped per origin, including scheme ([MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)). Host-only cookies can still be shadowed by a `Domain=gagnechris.com` cookie written from a public page (cookie tossing), because parent-domain cookies are sent to every subdomain.
    2. Tokens stop riding on every request. Today the cookie header (about 4 KB of JWTs) goes to S3 asset requests and to `/api/*`, where `ALL_VIEWER_EXCEPT_HOST_HEADER` forwards it into the Lambda event's `cookies`.
    3. Amplify's `KeyValueStorage` (localStorage) implements `addListener`, so `TokenStore.setupNotify` syncs refresh-token rotation across tabs.
  - Both are equally readable by script on their own origin. That's addressed in §6.
- **Second-app sign-in without a prompt (verified):**
  - The authorize endpoint docs say: "When you omit the `prompt` parameter from your request, managed login follows the default behavior: users must sign in unless their browser has a valid managed login session cookie". For `prompt=none`: "Amazon Cognito silently continues authentication for users who have a valid authenticated session. With this prompt, users can silently authenticate between different app clients in your user pool. If the user is not already authenticated, the authorization server returns a `login_required` error" ([authorize endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html); `prompt` needs managed login branding, which the pool uses).
  - **Session lifetime is one hour from the last interactive sign-in and doesn't slide.** "With this cookie, users can sign in again with the same authentication method for one hour… Authentication with the session cookie doesn't reset the cookie duration" ([managed login, "The one-hour managed login and hosted UI session cookie"](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html#managed-login-things-to-know)). The ID-token docs repeat that the session cookie is valid for 1 hour ([ID token](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html)).
  - So, with no extra work, the second app is silent only if it's opened within an hour of the first sign-in. Otherwise it costs one more prompt per app, about every 30 days. That's added friction compared with today, where one sign-in covers both.
  - **Decision (Chris, 2026-10-03): accept that occasional extra sign-in. No fan-out.**
    - Each app signs in on its own. If you open it within an hour of signing in elsewhere, the session cookie makes it silent. Otherwise you get one prompt, after which that app stays signed in for its 30-day refresh token.
    - That's simpler, with no extra redirects or `/auth/silent` route to build and test.
    - The fan-out design (a top-level `prompt=none` hop to the sibling after an interactive sign-in) is kept under rejected alternatives in case the friction turns out to matter.
- **Sign-out:** per app.
  - `signOut()` revokes that app's refresh token (`enableTokenRevocation` is on) and redirects to `/logout`, which clears the managed-login session.
  - The sibling app stays signed in until its own sign-out or refresh-token expiry.
  - Today's `signOut({ global: true })` probably doesn't revoke anything. `GlobalSignOut` needs an access token with `aws.cognito.signin.user.admin` ([GlobalSignOut](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_GlobalSignOut.html)), the clients request only `openid email profile`, and Amplify swallows the error (`signOut.mjs` `globalSignOut` catch). **Unverified live.** Phase 3 (web) should drop `global: true` rather than add the admin scope, which would let a stolen access token call Cognito self-service APIs.

### Rejected alternatives

| Option                                                                                    | Rejected because                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host-only `CookieStorage`                                                                 | Works (verified above), but it can be tossed from the apex, tokens are still sent with every request, and there's no cross-tab sync. Acceptable fallback if `localStorage` causes a problem in testing.                                                          |
| HttpOnly cookies via a backend-for-frontend (token exchange in Lambda or Lambda@Edge)     | The strongest storage, but Amplify has no BFF mode. It needs a new token endpoint, CSRF handling, and cookie-authenticated `/api` (today it's bearer-only, so CSRF isn't a concern). Out of scope; revisit if the account gains other users.                     |
| One shared client for both hosts                                                          | Per-prefix audience checks become impossible. An XSS on one host could start a code flow whose `redirect_uri` is the other host's callback on the same client.                                                                                                   |
| Separate user pools                                                                       | Two accounts, two passkeys, two sign-ins. Breaks "no added friction" and future shared user management.                                                                                                                                                          |
| Sign-in fan-out (top-level `prompt=none` hop to the sibling after an interactive sign-in) | Rejected by Chris (2026-10-03). It keeps one sign-in for both apps, but costs about four redirects per sign-in, a `/auth/silent` route, and browser testing (Safari ITP) for a prompt that comes roughly monthly. Revisit if the extra sign-ins become annoying. |
| Hidden-iframe silent auth                                                                 | Depends on Cognito pages being frameable and on third-party cookie behaviour. Neither is documented, and the top-level hop is documented.                                                                                                                        |

## 4. Permissions

### Decision

- **Groups:** `site-admin` (CMS) and `notebook`, both created by CDK with `ADMIN_USERNAME` attached to each. `admin` stays until legacy removal.
- **Which token:**
  - The web sends the **ID token** today (`getIdToken` in `apps/web/src/auth/session.ts`; RUNBOOK "Admin shell"). Keep that for this project.
  - The ID token carries `aud` = app client ID and `token_use: id`. The access token carries `client_id` (no `aud` unless resource binding is used) and `token_use: access`. Both carry `cognito:groups` ([ID token](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html), [access token](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-access-token.html)).
  - API Gateway checks "`aud` or `client_id` – Must match one of the audience entries… validates `client_id` only if `aud` is not present" ([HTTP API JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)).
- **Gateway:** two JWT authorizers on the same issuer ("You can configure distinct authorizers for each route", same doc):
  - `CognitoJwtAdmin` (audience `[admin-web]`, plus the legacy `web` while migrating) on `ANY /api/admin` and `ANY /api/admin/{proxy+}`;
  - `CognitoJwtNotebook` (audience `[notebook-web]`, plus legacy) on the two `/api/notebook` routes.
  - A wrong-client token gets a gateway **401**.
- **Router (defence in depth, and the only check in the local API):**
  - Route `auth` becomes `'public' | 'site-admin' | 'notebook'`. An invariant test asserts that `/admin*` patterns use `site-admin` and `/notebook*` patterns use `notebook`.
  - `invokeRoute` requires:
    1. a `sub`, else 401;
    2. `tokenClientId(claims)`: `aud` when `token_use === 'id'`, `client_id` when `token_use === 'access'`, otherwise none. It must equal the prefix's client ID (`ADMIN_WEB_CLIENT_ID` or `NOTEBOOK_WEB_CLIENT_ID` env), else 403;
    3. the prefix's group in `cognito:groups`, else 403.
  - Group parsing becomes strict: a JSON array, or the gateway's `[a b]` form split on whitespace only. That fixes the comma-split nit.
  - `/admin/me` stays admin-only; the Notebook doesn't call it today.
- **Legacy fallback:** Lambda env `AUTH_LEGACY_WEB_CLIENT_ID`, set from one infra constant `LEGACY_WEB_AUTH = true`. When it's set, a token whose client is that ID **and** whose groups include `admin` is accepted on both prefixes. That's exactly today's rule, so the window adds no new access. New-client tokens never fall back to `admin`. Legacy removal unsets the env var, drops the legacy client from both audiences, and deletes the client and the `admin` group.
- **Owner scoping** on Notebook data is unchanged. A `notebook`-only user can't reach `/api/admin/*` (no `site-admin` group, and the wrong client for the admin authorizer).

### Rejected alternatives

| Option                                                    | Rejected because                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Switch the web to access tokens now                       | API Gateway recommends scopes over ID tokens ("Unless you require ID tokens… configure your routes to require authorization scopes"). But custom scopes need a resource server and client scope changes. Follow-up once the apps are split; the router helper already handles both token types. |
| One authorizer with the union audience, router-only check | Works, but leaves a single code-level gate. Per-prefix authorizers reject wrong-client tokens before the Lambda runs, at no cost.                                                                                                                                                               |
| Infer the group from the path prefix in the router        | Less explicit. A route added under the wrong prefix would silently get the wrong policy, and declarative `auth` plus an invariant test catches that.                                                                                                                                            |
| Fall back to `admin` for new clients too                  | Not needed (Chris is in both new groups before any new-client token exists), and it would widen the migration window.                                                                                                                                                                           |

## 5. Cutover

### Order of deploys

1. **Phase 1, infra:**
   - certificate, buckets, distributions, DNS and the app viewer function;
   - new clients and groups with membership;
   - two authorizers, each with `[new client, legacy web]`, and the Lambda env (client IDs, legacy flag on).
   - Additive: the apex is unchanged. The new hosts serve an empty bucket (404) until Phase 3 (web).
2. **Phase 2, API:** per-prefix router checks with the legacy fallback on. Old apex `/admin` keeps working through the fallback.
3. **Phase 3, web (parallel run):**
   - The three builds go live. `admin.` and `notebook.` work end to end.
   - The public build is clean and the guard is on.
   - `deploy-web.sh` excludes `spa.html`, `manifest.json` and `icons/*` from the apex `--delete` for this one ticket. The **frozen legacy admin** (last combined `spa.html` and its hashed assets, which the assets sync never deletes) keeps serving `gagnechris.com/admin*` as a fallback.
   - Chris uses the new hosts for a soak (suggest 7 days).
4. **Phase 4, cutover:**
   - apex viewer-request redirects (below);
   - remove `/admin*`, `/auth*` behaviours, `AdminSecurityHeaders`, `isSpaShellPath`, the frozen objects, and Cognito and upload origins from the public CSP;
   - site bucket CORS becomes `admin.` only;
   - a one-release apex cookie sweep (below);
   - AASA apex `/auth/*` removed.
5. **Legacy removal** (in the cutover phase, or separately if it should soak):
   - unset `AUTH_LEGACY_WEB_CLIENT_ID`, drop `web` from both audiences, delete the `web` client, its branding and SSM param, and the `admin` group;
   - `VITE_COGNITO_WEB_CLIENT_ID` leaves CI.

### Redirect map (apex viewer-request, after the existing lowercase canonicalization)

| From                                     | To                                                     | Query                                      |
| ---------------------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| `/admin/notebook`, `/admin/notebook/<p>` | `https://notebook.gagnechris.com/` + `<p>`             | kept                                       |
| `/admin`, `/admin/<p>`                   | `https://admin.gagnechris.com/` + `<p>`                | kept                                       |
| `/auth`, `/auth/<p>`                     | `https://notebook.gagnechris.com/` (the daily-use app) | **dropped** (never forward `code`/`state`) |

- Use 301 with `Cache-Control: max-age=86400`.
- A 301 is heuristically cacheable ([RFC 9110 §15.4.2](https://www.rfc-editor.org/rfc/rfc9110#section-15.4.2)), and "these redirections are meant to last forever" ([MDN redirections](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Redirections)). The explicit max-age bounds how long a browser holds it if the cutover is rolled back.
- `/.well-known/*` on the apex is never redirected: Apple fetches AASA with no redirects allowed.

### Leftover apex cookies

- Legacy `CognitoIdentityServiceProvider.<webClientId>.*` cookies (`Domain=gagnechris.com`, 30 days) survive the cutover. They're readable by public pages and visible to subdomains.
- Two layers:
  1. For one or two releases, the public bundle runs a small sweep that expires every `CognitoIdentityServiceProvider.*` cookie with `Domain=gagnechris.com; Path=/`.
  2. Deleting the `web` client should make any copied refresh token useless. **Unverified:** a refresh grant for a deleted client should fail with `ResourceNotFoundException` or `invalid_client`. Check it in legacy removal with a test refresh using a throwaway token.

### PWA

- The installed app has `id`/`start_url` `/admin/notebook` on the apex. `start_url` "must be same-origin with the manifest URL" ([MDN start_url](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/start_url)), so it can't be migrated in place.
- The Notebook manifest becomes `id: "/"`, `start_url: "/"`, `scope: "/"` on `notebook.`.
- Reinstall steps (RUNBOOK):
  1. Delete the old Home Screen icon.
  2. Open `https://notebook.gagnechris.com` in Safari.
  3. Share, then Add to Home Screen.
  4. Sign in once inside the installed app (standalone apps keep their own storage, as today).
- Until then, the old icon opens the apex URL and follows the 301.

### iOS / AASA

- Each domain "must serve its own `apple-app-site-association` file", over HTTPS "with no redirects". Apple's CDN fetches it within 24 hours, and devices re-check about weekly ([Apple: Supporting associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)).
- `notebook.` serves AASA from `public-notebook/.well-known/`. `applinks` cover Notebook paths (`/today`, `/notes/*`, `/tasks/*`) and use `"exclude": true` for `/auth/*`, so web sign-in on an iPhone with the app installed never opens the app.
- The iOS https OAuth callback uses a distinct path, `/ios/auth/callback`, on the iOS client only.
- The apex AASA keeps only what still applies, with no `/auth/*`.
- The RP ID stays `auth.gagnechris.com`. `webcredentials:notebook.gagnechris.com` does nothing for passkeys until the RP ID changes, which ADR 0001 keeps out of scope.

### Rollback

| Stage             | Rollback                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 (infra)   | Revert. Purely additive: the apex doesn't depend on any new resource.                                                                                                  |
| Phase 2 (API)     | Revert. The legacy fallback means the apex admin never depended on the new checks.                                                                                     |
| Phase 3 (web)     | Use the frozen apex `/admin` while fixing forward, or revert (the public build gets admin back; the frozen `spa.html` is still in S3).                                 |
| Phase 4 (cutover) | Revert. The `/admin*` behaviours and `spa.html` come back on the next deploy, and the legacy client still exists. Cached 301s expire within 24 h (or clear site data). |
| Legacy removal    | Not cleanly reversible: a recreated `web` client gets a new ID and needs a web redeploy. Hence the soak before this step.                                              |

## 6. Security notes

**What the split fixes:**

- Public-page scripts (a compromised GA or GTM, or an XSS on a public page) can no longer read admin or Notebook tokens. The apps are different origins, `localStorage` is per origin, and after cutover the apex holds no tokens at all.
- The public bundle has no auth code to abuse.
- Admin and Notebook are compartments. An XSS in Notebook markdown can't read admin tokens, and the reverse. Per-prefix audiences stop one app's token calling the other's routes even if it leaks.
- Each client's callback list names only its own host, so a script on one host can't start a code flow that lands a code on a host it controls for the other client.

**What it doesn't fix:**

- An XSS **on an app host** still reads that host's tokens, including its 30-day refresh token. They're JS-readable by design, and HttpOnly needs a BFF (rejected above). The mitigations stay script-side: `script-src 'self'` with no third-party script on app hosts, and sanitized markdown (`renderMarkdownToHtml`).
- `admin.`, `notebook.` and the apex are **same-site** (one registrable domain). SameSite doesn't separate them, and an apex script can still set `Domain=gagnechris.com` cookies that app hosts and `auth.gagnechris.com` receive. App tokens aren't in cookies, so this can't plant tokens.
  - Cognito's own cookies (`cognito` session, `XSRF-TOKEN`, `csrf-state`) are "scoped only to your user pool endpoints" ([managed login, Cookies](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html#managed-login-things-to-know)). **Unverified:** whether they're HttpOnly and host-only, and how Cognito handles a tossed duplicate.
  - The worst plausible case is login CSRF into another pool account. Self sign-up is off and there's one user, so the risk is low.
- The **managed-login session cookie** on `auth.gagnechris.com` lasts one hour. Anyone with that browser during the hour can mint tokens for any client in the pool, but only to that client's registered `https` callbacks. That's why callbacks stay minimal. The `ios` client also registers the custom scheme `gagnechris://auth/callback`, which another app could claim, and is in the `/api/notebook` audience but not `/api/admin`. So that path can yield Notebook tokens only, and the `notebook` group still gates every Notebook route.
- Password sign-in, optional MFA and email-only recovery remain an **accepted risk**. The split doesn't change account takeover.
- ID and access tokens stay valid at the API until `exp` (1 hour) after sign-out or revocation. The JWT authorizer validates statelessly; its listed checks don't include revocation ([HTTP API JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)). Same as today.

## Unverified, and how to test

| Claim                                                                          | Test (ticket)                                                                                                                                   |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Second app is silent within the one-hour session in Safari, Chrome and Firefox | Phase 3 (web): sign in to admin, then open Notebook within the hour and confirm no prompt. After more than an hour, confirm exactly one prompt. |
| Free tier is per account                                                       | Not decision-relevant; check the first bill after Phase 1 (infra).                                                                              |
| Today's `signOut({ global: true })` silently fails `GlobalSignOut`             | Phase 3 (web): sign out on prod, then check that the old refresh token still refreshes (read-only `initiate-auth` with a throwaway session).    |
| Deleting the `web` client invalidates its refresh tokens                       | Legacy removal: refresh with a pre-deletion token and expect an error.                                                                          |
| Cognito session cookies are HttpOnly and host-only                             | Phase 1 (infra): inspect `Set-Cookie` from `auth.gagnechris.com` in devtools (attributes only, never values).                                   |

## Consequences

- Three deploy targets and three distributions to keep healthy. `deploy-web.sh` and CI build time grow by about two Vite builds.
- Notebook gets its own origin for a future offline cache and service worker, and its own AASA.
- User management (a later project) can add Notebook-only users by group, with no API change.
- `docs/architecture.md` (Auth, Security headers, Notebook shell, deploy), `docs/development.md`, `docs/local-e2e.md`, `infra/RUNBOOK.md` (hosts, sign-in, PWA reinstall, recovery) and `CLAUDE.md` change in the implementing tickets, each with its own change.
