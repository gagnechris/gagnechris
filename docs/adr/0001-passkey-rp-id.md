# ADR 0001: Passkey relying party ID

**Status:** Accepted (2026-10-02)  
**Context:** Cognito User Pool passkeys + future iOS native auth.

## Decision

**Keep the passkey RP ID as `auth.gagnechris.com`** (the Cognito managed-login custom domain), matching `AUTH_DOMAIN` / `passkeyRelyingPartyId` in `infra/lib/stacks/auth-stack.ts`.

Do **not** change the RP ID to the apex (`gagnechris.com`) before iOS ships unless we are prepared to invalidate every existing web passkey.

## Why

1. **Cognito constraint with managed login.** With a custom domain and managed login, Cognito expects the passkey RP ID to be that custom domain’s FQDN (`auth.gagnechris.com`). See [WebAuthnConfigurationType](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_WebAuthnConfigurationType.html) and the [passkey authentication flow docs](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html).
2. **Changing RP ID orphans credentials.** Existing passkeys are bound to the current RP ID; a switch forces every user to re-register.
3. **AASA cannot be hosted on the Cognito domain.** We control `gagnechris.com` (S3 + CloudFront), not `auth.gagnechris.com`. Native `ASAuthorization` / `webcredentials:` against the Cognito host is therefore not available today.
4. **iOS path that works without RP ID change.** Sign-in via **managed login inside `ASWebAuthenticationSession`** (or equivalent) keeps passkeys in the browser context on `auth.gagnechris.com`. The callback `https://notebook.gagnechris.com/ios/auth/callback` (with the custom scheme `gagnechris://auth/callback` until the app switches over, [ADR 0004](./0004-ios-app.md#5-auth-callback)) returns the code to the app.

## Apex `/.well-known` files

We still publish on **`https://gagnechris.com`**:

| Path                                      | Purpose                                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/.well-known/apple-app-site-association` | `webcredentials` only, for a **future** apex RP ID; no `applinks` (Notebook universal links are in `notebook.gagnechris.com`'s own AASA) |
| `/.well-known/webauthn`                   | Related-origins placeholder for apex WebAuthn                                                                                            |

Both AASA files name the app `FF9YB7FZ7A.com.gagnechris.mobile` (Apple Team ID `FF9YB7FZ7A`). The notebook host's AASA also lists the app under `webcredentials`, which associates it for the https sign-in callback, not for passkeys: the RP ID is still `auth.gagnechris.com`.

## Consequences

- Native in-app passkey UI (`ASAuthorizationController`) stays **out of scope** until either Cognito serves AASA on the auth host, or we deliberately migrate RP ID (with a passkey re-enrollment plan).
- Refresh tokens last **30 days** from sign-in; rotation doesn't extend them, so the iOS user signs in again monthly ([ADR 0004](./0004-ios-app.md)).
- The iOS Cognito sign-in (tokens in SecureStore) uses managed login in `ASWebAuthenticationSession`, not an apex RP ID.

## Alternatives considered

| Option                                                                   | Rejected because                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Set RP ID to `gagnechris.com` now                                        | Breaks managed-login passkey constraint and orphans existing web passkeys |
| Host AASA only; keep auth domain RP ID for native `webcredentials:auth…` | Cannot write objects on Cognito’s managed-login host                      |
