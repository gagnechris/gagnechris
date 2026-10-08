# ADR 0004: iOS app stack, v1 offline policy, local data and tokens

**Status:** Accepted (2026-10-07)  
**Context:** `apps/mobile` is an Expo app that already bundles `@gagnechris/shared`, `api-client`, `app-core` and `tokens` under Metro and runs in CI (see [mobile.md](../mobile.md)). The iPhone app is TestFlight only, Notebook first, signed in through Cognito managed login with the RP ID `auth.gagnechris.com` ([ADR 0001](./0001-passkey-rp-id.md)). This ADR fixes the stack, what v1 does without a connection, what the app stores on the phone and how, and the policies the later offline outbox must follow so v1 doesn't block it.

## Decision summary

| Area             | Decision                                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack            | Expo SDK 57, React Native 0.86, expo-router `~57.0.24` (tabs, native stacks, sheets), EAS dev client. Expo Go is not supported.                                                                                                        |
| Routes           | File routes mirror the Notebook web paths (`/today`, `/notes/[id]`, `/tasks/[id]`), so the notebook host's universal links open the same screen with no mapping.                                                                       |
| v1 offline       | Cached reads, online edits. Last-seen Notebook data opens instantly and stays readable offline; edits need a connection and are held in memory until they save.                                                                        |
| Cache store      | TanStack Query cache persisted to `@react-native-async-storage/async-storage` 2.2.0 with `@tanstack/query-async-storage-persister`. Not MMKV, not expo-sqlite (the later outbox uses expo-sqlite).                                     |
| Data at rest     | iOS default Data Protection (Protected Until First User Authentication). Cache excluded from backups. No app-level encryption.                                                                                                         |
| Sign-out         | Stops the persister, clears the query client, the pending-save queue, AsyncStorage and the Keychain items, and revokes the refresh token. A session that expires is not a sign-out and wipes nothing unless a different user signs in. |
| Tokens           | `expo-secure-store` with `keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, one item per token. Single-flight refresh that writes the rotated refresh token before releasing waiters.                                          |
| Refresh lifetime | 30 days from sign-in, with rotation on. Rotation does not extend it. No change for iOS.                                                                                                                                                |
| Face ID          | No Face ID unlock in v1.                                                                                                                                                                                                               |
| Auth callback    | `gagnechris://auth/callback` in simulator and dev builds now. `https://notebook.gagnechris.com/ios/auth/callback` before the first TestFlight build, and the custom scheme is removed from the `ios` client then.                      |
| API audience     | The `/api/notebook` JWT authorizer and router accept the `ios` client when sign-in ships. `/api/admin` does not, until the Admin space.                                                                                                |
| Later outbox     | Persistent FIFO outbox in expo-sqlite with per-entity coalescing and dependencies; 412 is field merge for tasks and server-wins plus a kept local copy for note bodies; 410 never drops pending edits; 426 pauses writes.              |

## 1. Stack

### Versions

Native modules follow the installed SDK. `apps/mobile/node_modules/expo/bundledNativeModules.json` (Expo 57.0.26, from `expo ~57.0.25`) pins:

| Package                                     | Version                | Used for                                            |
| ------------------------------------------- | ---------------------- | --------------------------------------------------- |
| `expo-router`                               | `~57.0.24`             | Navigation                                          |
| `react-native-screens`                      | `~4.26.0`              | Native stacks (expo-router peer)                    |
| `react-native-safe-area-context`            | `~5.7.0`               | Safe areas (expo-router peer)                       |
| `expo-linking`, `expo-constants`            | `~57.0.11`, `~57.0.20` | expo-router peers                                   |
| `expo-dev-client`                           | `~57.0.19`             | Dev builds                                          |
| `expo-auth-session`, `expo-web-browser`     | `~57.0.13`, `~57.0.3`  | PKCE flow in `ASWebAuthenticationSession`           |
| `expo-secure-store`                         | `~57.0.4`              | Keychain tokens                                     |
| `expo-crypto`                               | `~57.0.3`              | `crypto.getRandomValues` for `createUlid` on Hermes |
| `@react-native-community/netinfo`           | `12.0.1`               | Connectivity                                        |
| `@react-native-async-storage/async-storage` | `2.2.0`                | Persisted query cache                               |
| `expo-sqlite`                               | `~57.0.3`              | Later outbox                                        |
| `expo-build-properties`                     | `~57.0.22`             | iOS deployment target                               |

Install them with `npx expo install <package>` inside `apps/mobile` so the version comes from that file. `@tanstack/react-query-persist-client` and `@tanstack/query-async-storage-persister` are plain JavaScript and track the installed `@tanstack/react-query` minor (5.104).

The minimum iOS version is Expo SDK 57's 16.4 until the HTTPS callback lands, which needs 17.4 (§5).

### Navigation

expo-router on React Navigation's native stack and tabs:

- `app/_layout.tsx`: providers (query client and persister, API client, auth gate) and the root stack.
- `app/(tabs)/_layout.tsx`: the tab bar from the phone artboards, **Today**, **Upcoming**, **Notes**, **Tasks**, **More**. Each tab is its own stack, so `(tabs)/notes/[id].tsx` is `/notes/[id]` with the tab bar kept.
- Search and writing a task are sheets (`presentation: 'formSheet'`); sign-in and No access sit outside the tabs.

Route groups don't change the URL, so the app's paths equal the paths the notebook AASA already lists (`/today`, `/notes/*`, `/tasks/*`).

### Builds

An EAS dev client (`expo-dev-client`), with an `eas.json` `development` profile for the simulator (`ios.simulator: true`) and a TestFlight profile once the Team ID exists. Expo Go runs under its own bundle id and `exp://` scheme, so the `gagnechris` callback, associated domains and the app's own Keychain items don't exist there; it isn't a target. `npx expo run:ios` builds the same app locally with Xcode.

## 2. v1 offline policy: cached reads, online edits

### Cache store

The TanStack Query cache is persisted as one JSON value (`createAsyncStoragePersister`, 1 s throttle), so the store only needs a reliable string key-value API.

| Concern                  | AsyncStorage 2.2.0                                                                               | react-native-mmkv 4.3                                             | expo-sqlite 57 (`expo-sqlite/kv-store`)                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| In Expo SDK 57           | yes (`2.2.0`)                                                                                    | no; needs `react-native-nitro-modules`, versioned outside the SDK | yes (`~57.0.3`)                                                                              |
| Where on iOS             | `Application Support/<bundle id>/RCTAsyncLocalStorage_V1`, **excluded from backup by default**   | its own file; backup exclusion is up to the app                   | `kv-store` opens in `Documents/SQLite` (backed up); only the raw API takes another directory |
| Wipe                     | `clear()` deletes the storage directory; values over 1 KB are separate files, written atomically | `clearAll()`; memory-mapped file                                  | `DELETE` leaves old text in free pages unless `secure_delete` is on or the file is deleted   |
| Size                     | no iOS cap; each write rewrites the value                                                        | fast, but the whole file is mapped into memory                    | no practical cap                                                                             |
| Encryption               | Data Protection only                                                                             | optional AES with a key the app must keep in the Keychain         | SQLCipher via config plugin, key in the Keychain                                             |
| Fit for the later outbox | no transactions                                                                                  | no transactions                                                   | transactions and ordered queries                                                             |

**Decision: AsyncStorage.** It ships with SDK 57, needs no config plugin, is already outside iCloud and device backups, and a sign-out wipe removes files instead of leaving deleted text inside a database. MMKV's speed doesn't matter behind a 1 s throttle, it adds a native dependency Expo doesn't version, and its encryption adds nothing (see Data at rest). expo-sqlite's `kv-store` would put the cache in a backed-up directory; SQLite's transactions are what the outbox needs, so the outbox uses it (§6) and the cache stays separate and disposable.

### What is persisted

- **Persisted:** Notebook list and detail queries (Today's note, notes lists and details, tasks lists and details, Upcoming), chosen with `dehydrateOptions.shouldDehydrateQuery` on the app-core query keys.
- **Not persisted:** search queries and results (terms stay off disk, as they stay out of URLs), session and profile data, anything under Admin.
- `maxAge` is 30 days, the longest a session can last (§4), and persisted queries use a `gcTime` of at least `maxAge` so restore doesn't drop them.
- `buster` is `<cache schema version>:<Cognito sub>`. A schema change, or a different user, discards the stored cache on restore.
- `PersistQueryClientProvider` restores before cached screens render, then queries refetch when online.
- The value grows with the cache (note bodies are up to 100 KB). If its write time is noticeable on device, switch to per-query persistence on the same storage, not to another store.

### Connectivity

- NetInfo drives TanStack's `onlineManager`; `AppState` drives `focusManager`.
- Offline shows a quiet banner, "Offline — showing saved copy".

### Edits

- Editors use the app-core hooks (`useVersionedEntityEditor`, `useVersionedDocEditor`) with the web's autosave rules: network, 408, 429 and 5xx failures retry on the 2 s to 60 s backoff, 409/412 and other 4xx don't.
- `retrySignals` on iOS fires when NetInfo goes from not connected to connected and when `AppState` becomes `active`, so a held edit saves as soon as the phone is back online.
- An editor with an unsaved edit while offline shows "Offline — will save when connected". Leaving it hands the edit to app-core's pending-save queue, which keeps retrying; the app shows a count of unsaved edits until the queue is empty.
- **Exactly once.** If a save landed but its response was lost, the retry sends the old version and gets a version conflict. A conflict whose `current` already holds the exact fields being sent is a save that landed: the client adopts `current.version` and reports Saved. app-core doesn't do this yet.
- Held edits live in memory. They survive navigation and backgrounding, not the app being killed; the outbox makes them durable.

## 3. Data at rest

| Data                         | Where                                         | Protection                            |
| ---------------------------- | --------------------------------------------- | ------------------------------------- |
| Persisted query cache        | AsyncStorage (Application Support, no backup) | Data Protection, default class        |
| Unsaved edits (v1)           | Memory only                                   | none needed                           |
| Refresh token, ID token      | Keychain via expo-secure-store                | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` |
| Install marker, cache schema | AsyncStorage                                  | as the cache                          |

**Data Protection class: the iOS default, Protected Until First User Authentication.** The refresh token has to be readable after first unlock (§4), and anyone who can read files of that class can also read the refresh token and fetch everything from the API. A stricter class (`NSFileProtectionComplete`) on the cache would add no protection against that attacker and would make writes fail when the phone locks while the app is still saving. For the same reason there's no encrypted MMKV or SQLCipher: the key would sit in the same Keychain class as the refresh token.

**Wipe on sign-out**, in this order, so a throttled persist can't write the cache back:

1. Stop the persister subscription.
2. `queryClient.clear()` and clear app-core's pending-save queue. Sign-out with unsaved edits asks first ("N unsaved edits will be lost").
3. `AsyncStorage.clear()` (nothing else lives there in v1). Anything the app later stores on disk joins this list, and the sign-out test asserts every store is empty.
4. Revoke the refresh token (`/oauth2/revoke`; the clients have token revocation on).
5. Delete the Keychain items.

**Session expiry is not sign-out.** When a refresh fails with `invalid_grant`, the app keeps the cache and held edits and asks the user to sign in again. If the new ID token has the same `sub`, held edits resume; if not, the wipe runs before anything renders.

**Reinstall.** Keychain items can outlive an uninstall on iOS; AsyncStorage doesn't. On a launch with no install marker in AsyncStorage, the app deletes its Keychain items before reading them.

## 4. Tokens

- **Storage:** `expo-secure-store`, one Keychain item per value (refresh token, ID token, and the `sub` and sign-in time), so no single value approaches the size some iOS releases rejected (about 2 KB). ID and access tokens are also kept in memory.
- **Accessibility class:** `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, not the default `WHEN_UNLOCKED`. With rotation (below) every refresh returns a new refresh token that must be written; under `WHEN_UNLOCKED` a refresh that finishes after the phone locks can't write it, and once the 30 s grace passes the session is lost. `THIS_DEVICE_ONLY` keeps the items out of backups and off new devices.
- **Lifetimes** (`infra/lib/stacks/auth-stack.ts`, shared by every client): ID and access tokens 1 hour, `refreshTokenValidity` 30 days, `refreshTokenRotationGracePeriod` 30 s. CDK turns the grace period into `RefreshTokenRotation: ENABLED` and leaves `ALLOW_REFRESH_TOKEN_AUTH` off. Cognito documents that a rotated token is valid only for the time left on the original, so a session ends 30 days after the interactive sign-in however often it refreshes ([Refresh tokens](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html)).
- **Refresh:** the token endpoint's `refresh_token` grant (`expo-auth-session` `refreshAsync`), which supports rotation. Refresh is single flight in the token provider: concurrent callers wait on one request, and the new refresh token is written to the Keychain before they're released. `api-client` today calls `getToken({ forceRefresh: true })` once per refused request, so the token provider is where concurrent refreshes collapse. A network failure keeps the current tokens; `invalid_grant` ends the session (§3).
- **Keeping 30 days:** a passkey sign-in is one Face ID prompt, and a longer lifetime would apply to the web clients too. When fewer than three days remain and the app is online, More shows "Sign in again to stay signed in", so a trip offline doesn't end at the hard limit.
- **API token:** the app sends the ID token, as the web does (the authorizer checks `aud`). The `notebook` group is required; without it the app shows No access.

### Face ID

**No Face ID unlock in v1.** The phone's own passcode and Face ID already gate it, and the app holds one person's notes. `requireAuthentication` on the Keychain items would prompt on every read of the refresh token, so a refresh could never run unattended, and those items become unreadable whenever enrolled biometrics change, which forces a sign-in. If an app lock is wanted later, it's a UI gate with `expo-local-authentication` on returning to the foreground, without binding the tokens to biometrics.

## 5. Auth callback

### Now: custom scheme

- `expo-auth-session` (PKCE, `S256`) with `expo-web-browser`'s `ASWebAuthenticationSession`, `preferEphemeralSession: true`, so no managed-login cookie stays in the session after sign-out. Passkey sign-in in an ephemeral session is checked when sign-in is built; if it fails, the session is shared and sign-out also calls `/logout`.
- Redirect `gagnechris://auth/callback`, already on the `ios` client.
- The risk it carries: the `ios` client ID is public, and `ASWebAuthenticationSession` returns the callback to whichever app opened the session, so another app could run its own flow with our client and scheme. PKCE stops interception of our flow, not that. It's accepted for simulator and dev builds only.

### Before the first TestFlight build: HTTPS callback

TestFlight needs the Apple Team ID, and so does the HTTPS callback, so they ship together:

1. The notebook host's AASA (`apps/web/public-notebook/.well-known/apple-app-site-association`) gets the real Team ID and a `webcredentials` entry for the app. An HTTPS callback is verified through the callback host's `webcredentials` association, not `applinks`, and iOS gives no error when it's missing: the sign-in sheet just closes. `applinks` stay as they are, so a stray link to the callback path opens the notebook website, where the code is useless without the app's PKCE verifier.
2. `app.json` gets `webcredentials:notebook.gagnechris.com` and `applinks:notebook.gagnechris.com`. `applinks:gagnechris.com` matches no paths and goes.
3. The `ios` client's callbacks become `https://notebook.gagnechris.com/ios/auth/callback` only: `gagnechris://auth/callback` and the inherited apex `https://gagnechris.com/auth/callback` go, and the logout URLs match.
4. `promptAsync` passes `preferUniversalLinks: true`. expo-web-browser 57 then uses `ASWebAuthenticationSession.Callback.https(host:path:)`, which completes only for an app associated with that host, and exists only on iOS 17.4 or later; below that, or without the option, it falls back to scheme matching. `expo-build-properties` sets the deployment target to 17.4, so the fallback never runs.

### API audience

When sign-in ships, the `/api/notebook` authorizer's `jwtAudience` and the router's client check accept the `ios` client ID, and `/api/admin` doesn't until the Admin space exists. This replaces the rule that the `ios` client stays out of every API audience until universal links ([ADR 0002](./0002-admin-notebook-subdomains.md), the comment in `infra/lib/stacks/api-stack.ts`): simulator sign-in against prod needs it, and the custom-scheme exposure lasts only until the first TestFlight build.

## 6. Later milestone: offline outbox

These policies bind the outbox work; v1 implements none of them except where noted.

### Store

expo-sqlite, one database for the outbox and synced entities, opened in a directory excluded from backup (not the default `Documents/SQLite`). Sign-out closes and deletes the database file instead of deleting rows. Its schema has its own migrations, and an app update never drops pending operations.

### Ordering and dependencies

- One FIFO log of operations, sent one at a time in enqueue order (the API has no batch endpoint). Each operation records the entity id, the base version it was made against and, for updates, the fields it changes and their base values.
- **Coalescing:** consecutive updates to one entity merge into one, keeping the earliest base version. An unsent create absorbs later updates. A create that has been sent at least once is never changed: its retry must match the stored `createHash`, so later edits queue as updates.
- **Dependencies:** a task whose `noteId` names a note not yet created waits for that note's create; a note update that embeds a task waits for that task's create. FIFO gives both, because the user made the referenced entity first. A failed operation blocks only the operations on the same entity or that depend on it; the rest keep going.
- **Edit then delete:** a delete drops the unsent updates before it. If the create was never sent, the create and delete both vanish locally. If the create was sent, the delete waits for it to settle.
- `complete` and `reopen` on one task coalesce to the last one.

### 412 conflicts

The `412` body has `current` and `currentVersion`. First, if `current` already holds the operation's fields, the operation landed earlier (§2) and is done.

- **Tasks: field merge.** Task fields are independent, so for each field the operation changed, if `current` still has the base value, the change is re-sent with `If-Match: "<currentVersion>"`. If the server changed the same field, the task is a conflict.
- **Note bodies: server wins, local copy kept.** No automatic three-way merge of markdown: a line merge of prose can produce text neither side wrote, silently. The editor shows the server's note with the local text alongside, and three actions: **Keep mine** (send the local text with `If-Match` on `currentVersion`), **Keep theirs**, **Save mine as a new page**. Note metadata (title, tags, pinned) uses the task field merge.
- A conflict parks that entity's operations, shows a conflicts count, and keeps the local copy until the user picks; nothing is discarded without a choice.
- **409 `deleted`** (deleted on another device while edited here): the local copy is kept and offered as **Restore as new**, a create with a new ULID.

### 410 `resync_required` with pending edits

The outbox is kept. The app pauses sending, fetches the full feed with no `since`, rebuilds the entity tables from it, and drops local entities missing from the feed unless an operation still refers to them. Then it resumes the outbox: each operation carries its base version, so anything overtaken meets 412 and the policy above. Creates are idempotent by ULID.

### Daily note `daily_taken`

The rule in [data-model.md](../data-model.md) holds: keep the local draft, never retry the create with the losing ULID. On top of it:

- If the local draft is empty or still only the carry-in placeholder, the app adopts `current` with no prompt, because nothing would be lost.
- Otherwise it shows a conflict with **Merge** as the default: append the local text under the winner's, dropping embed lines whose task the winner already embeds (both may carry the same tasks in), sent as an update to `current.id` with `current.version`. **Use the saved note** discards the local text only after a confirmation.
- Tasks created in the losing note point their `noteId` at `current.id`: unsent creates are rewritten, sent ones get an update.

### 426 `upgrade_required`

The app sends `x-gagnechris-client-version` (`MAJOR.MINOR.PATCH`, the app version) on every request from v1; the API checks it on the sync feed. On a 426 the app stops syncing and sending the outbox, keeps it, leaves cached reads available, and shows a blocking banner to update from TestFlight with `minClientVersion`. The outbox resumes after the update.

## Alternatives considered

| Option                                           | Rejected because                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| SwiftUI                                          | Gives up the shared schemas, API client, autosave hooks and tokens that already run under Metro                     |
| React Navigation without expo-router             | expo-router is that navigator with file routes; matching the web paths gives universal links with no linking config |
| react-native-mmkv for the cache                  | Native dependency outside the SDK, needs Nitro modules; speed and encryption don't help here                        |
| expo-sqlite for the v1 cache                     | `kv-store` lands in a backed-up directory and deletes leave free pages; its strengths are for the outbox            |
| `NSFileProtectionComplete` or an encrypted cache | The refresh token is readable after first unlock anyway; failed writes on lock for no gain                          |
| `WHEN_UNLOCKED` Keychain items (the default)     | A rotated refresh token can't be written after the phone locks                                                      |
| Face ID-bound tokens                             | Every refresh needs a Face ID prompt; biometric changes force a sign-in                                             |
| Longer refresh token for iOS                     | Shared client settings; re-sign-in is one passkey prompt                                                            |
| Keeping the custom scheme in TestFlight builds   | Any app can drive a flow to that scheme with our public client                                                      |
| Three-way markdown merge on 412                  | Can silently produce text neither device wrote                                                                      |

## Consequences

- An edit made offline in v1 is lost if iOS kills the app before the connection returns; the unsaved-edits count makes that visible until the outbox ships.
- Every 30 days after signing in, the user signs in again.
- The app can't run in Expo Go; development uses the dev client in the simulator.
- The minimum iOS version becomes 17.4 with the HTTPS callback.
- `docs/mobile.md` describes the app as it is; this ADR is the target for the work below.

## Follow-up work

1. app-core: treat a version conflict whose `current` already holds the sent fields as saved.
2. Token provider with single-flight refresh, the Keychain items and class above, the `invalid_grant` and reinstall rules, and the sign-out wipe.
3. Accept the `ios` client on `/api/notebook` (authorizer audience and router check).
4. expo-router shell, EAS dev client, `expo-crypto` polyfill for `createUlid`.
5. Persisted cache, NetInfo and `AppState` wiring, iOS `retrySignals`, offline banner and unsaved-edits count.
6. With the Team ID: the HTTPS callback steps in §5.
7. Outbox and sync per §6.
