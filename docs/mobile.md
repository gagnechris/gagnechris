# Mobile (Expo)

`apps/mobile` is an Expo (SDK 57, `expo ~57.0.25`; React Native 0.86.3; React 19.3.0) app that runs the monorepo's client packages under Metro, built as an EAS dev client. Navigation is expo-router: routes live in `apps/mobile/app/`.

## Notebook shell

| Route                                  | Screen                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `app/_layout.tsx`                      | Providers (session, persisted query cache, area, `NetworkStatus`, `AppApiProvider`) and the root stack with its gate |
| `app/(tabs)/_layout.tsx`               | Tab bar: Today, Upcoming, Notes, Tasks, More (SF Symbols via `expo-symbols`)                                         |
| `app/(tabs)/<tab>/_layout.tsx`         | One native stack per tab, so detail screens keep the tab bar and edge-swipe back                                     |
| `app/(tabs)/today/index.tsx`           | `/today`: the day's note, Still open / Coming up and day navigation (see [Today](#today))                            |
| `app/(tabs)/upcoming/index.tsx`        | `/upcoming`: large title, Work / Personal / All segmented control                                                    |
| `app/(tabs)/notes/index.tsx`           | `/notes`: large title, All / Daily / Pages                                                                           |
| `app/(tabs)/notes/[id].tsx`            | `/notes/:id`: the note editor (see [Notes](#notes))                                                                  |
| `app/(tabs)/tasks/index.tsx`           | `/tasks`: large title, filter chips                                                                                  |
| `app/(tabs)/more/index.tsx`            | `/more`: account (name, email, access level), Your apps (Notebook only), default area, sign out                      |
| `app/no-access.tsx`, `app/sign-in.tsx` | Outside the tabs                                                                                                     |

Upcoming and Tasks are shells with their empty states. `app/index.tsx` redirects to `/today`, and the paths match the notebook web paths.

- **Gate:** `rootGuards` in `src/session.tsx` drives `Stack.Protected`: a signed-in user with the `notebook` group sees the tabs, one without it sees No access, a signed-out user sees sign-in.
- **Session:** `SessionProvider` takes an `AuthBackend` and a `wipe` callback; `getToken` goes to one `createApiClient` instance. See [Sign-in](#sign-in).
- **Area:** Work / Personal / All, shared between the Today chip (an action sheet), the Upcoming segmented control and More's Default area row. It's stored in AsyncStorage under `gagnechris.notebook.areaFilter`, the key the web keeps in localStorage; the filter values, labels and key come from `@gagnechris/shared` (`notebook-area.ts`).
- **Look:** colours and sizes from `@gagnechris/tokens` through `src/theme.ts`. Inter (400, 500, 600, 700 from `@expo-google-fonts/inter`) is embedded at build time by the `expo-font` config plugin, so no font loads at runtime; styles spread `font.<weight>` from `src/theme.ts`, which sets both the PostScript name (`Inter-SemiBold`) and the `fontWeight`; with the name alone React Native can fall back to the regular face. Native large titles on Upcoming, Notes, Tasks and More.
- **Accessibility:** every control has a role and a label and is at least 44 pt tall; icons are hidden from VoiceOver; text never sets `numberOfLines`, `allowFontScaling={false}` or a fixed height, so Dynamic Type sizes wrap instead of truncating. `src/screens.test.tsx` checks all of this on every screen.

## Notes

`/notes` lists every note in the area (all list pages load, since pages aren't date-ordered) under Pinned, This week and Earlier with `noteSections` from `@gagnechris/shared`, the grouping the web list uses. A row shows the title, the first line, the day and, in All, the area, plus "N open" for embedded tasks that are still open (counted once every open task, any area, has loaded). All / Daily / Pages filters the list request. Typing in "Search notes" switches to the server search (`POST /api/notebook/search`, note hits only), so it finds notes that aren't loaded. Pull to refresh refetches. The compose button creates an Untitled page in the current area (Work for All) and opens it.

Each row has Pin / Unpin and Delete, each behind a confirm alert: long press, the row's ⋯ button and VoiceOver's actions rotor all offer them. Pinning goes through app-core's `usePinNoteMutation`.

`/notes/:id` edits a note with app-core's `useVersionedDocEditor` (the web autosave and debounce); the header shows Saving… / Edited / Saved / Offline, the Preview toggle and a ⋯ menu with Pin / Unpin, Share and Delete. Under the title (read-only for a daily note) are the area, a pin marker, the tags (tap one to remove it) and "+ tag". Leaving the foreground saves straight away, without waiting for the debounce.

- **Body.** `NoteBodyEditor` keeps the body as plain markdown. `noteSegments` splits it into runs of text, each a native multiline `TextInput`, around the `{{task:…}}` lines, which show as task rows. A text run sits before, between and after every task, and is keyed by the task after it, so the view being typed in stays mounted when a line above it turns into a task.
- **Tasks from lines.** A `[ ] …` line becomes a task when the caret moves to another line or the field loses focus, with the web rules: `parseTaskLine` from `@gagnechris/shared` (task syntax for `@…`, `due:…` and `!…`), a client ULID, and app-core's `useNoteTaskEmbedSync`, which creates the task (retrying while the API is unreachable) and reports what each row shows. A line is only converted if its text is unchanged, so a backspace that pulls a task line up does not convert it. Lines in a code fence stay text.
- **Task rows.** The box completes or reopens the task with a light haptic (`expo-haptics`) through app-core's task mutations, so Today, Tasks and other notes update from the same cache. The title opens `/tasks/:id`. Long press or the VoiceOver action removes the line from the note; the task stays.
- **Keyboard toolbar.** An `InputAccessoryView` with Task, Date (`@`), Priority (`!`), Heading, List, Link and Hide keyboard. `applyToolbarAction` (`src/notebook/toolbarEdits.ts`) inserts at the caret or wraps the selection; the line markers toggle. While `@…` or `due:…` is being typed on a task line, the toolbar shows the shared `taskDateMenuItems` as chips ("Show this task on": Tomorrow, Monday, Next week, Someday, Pick a date…, Deadline…) and inserts the choice with `tokenInsertion`. Pick a date… opens a calendar sheet (`@react-native-community/datetimepicker`).
- **Preview.** The eye button swaps the editor for `MarkdownView` with live task rows.
- **Keyboard.** The screen's `ScrollView` uses `automaticallyAdjustKeyboardInsets`, so content scrolls above the keyboard and toolbar.

Query caching and offline state are described in [Cached reads and offline](#cached-reads-and-offline). `src/markdown/MarkdownView.tsx` renders markdown (see [Markdown](#markdown)); the note editor's Preview uses it. [ADR 0004](./adr/0004-ios-app.md) sets the stack (expo-router, EAS dev client), the v1 offline policy (cached reads, online edits), what is stored on the phone, token storage and the auth callback. `src/ulid.ts` re-exports `createUlid` from `@gagnechris/shared` for client-generated ids. `createUlid` is not monotonic within one millisecond: two ids from the same millisecond sort by their random part.

## Today

`/today` shows one day for the area chosen on the area chip; the day follows the device's date (`useLocalToday` rolls it over at midnight and when the app returns) until ‹ or › picks another, and Today comes back to it.

- **Tasks.** app-core's `useTodayTasks` (shared with web) loads the open tasks showing on the day and those starting in the next 14 days, and splits them with `bucketTodayTasks`: a task the day's note embeds is in the note, an open task showing on the day is Still open, a later one is Coming up. Carry-forward is that computation, so nothing is written overnight. The banner ("N still open · N coming up") opens a sheet with the two lists as tabs. A Still open row shows the source ("Thu note · 1 day", "Scheduled Sep 28") and has + Note (today only), and ⋯ or a long press for Snooze (the shared date items, or Pick a date…) and Drop. Snooze and Drop go through app-core's `useTaskPatch`, so the row leaves at once and comes back if the write fails.
- **Note.** `TodayNote` edits the day's daily note with `dailyNoteResource` and the note editor ([Notes](#notes)). Today's note is opened with carry-in, as on web; any other day is written on first edit. If another device created the day first, the save fails with `daily_taken`: the typed text stays, and "Add it to their note" appends it to that note (app-core's `useMergeIntoDailyNoteMutation`) and shows the result.
- **Footer.** "N open tasks will carry to <next day> if not done" on today and later days.
- **All.** With All selected there is no note, and the lists are read-only.

## Entry and polyfills

`package.json` `main` is `index.ts`, which imports `src/polyfills.ts` and then `expo-router/entry`, so the polyfills run before any route module is evaluated. Hermes has no `crypto.getRandomValues`, which `createUlid` requires (it throws rather than fall back to `Math.random`); `src/polyfills.ts` installs expo-crypto's `getRandomValues` on `globalThis.crypto` unless the runtime already has one.

## Markdown

`MarkdownView` (`src/markdown/`) renders note bodies and task descriptions with the same structure as the web Notebook preview (`renderMarkdownToHtml`): headings, paragraphs, bold / italic / strikethrough, lists and task lists (read-only checkboxes), inline code and code blocks in Menlo, quotes, links, images, tables (horizontal scroll) and rules.

- **Parser.** `@gagnechris/shared/markdown-ast` (`parseMarkdownBlocks`) turns markdown into plain data using `marked`'s `Lexer`, the same lexer and options the web renderer uses, so both split a note into the same blocks. `check:rn-bundles` bans `marked` from the RN-facing entries to keep the HTML renderers and the sanitizers (`sanitize-html` pulls in postcss and htmlparser2) out of them and out of pages that never render markdown; `marked` itself touches no DOM or Node API. So the ban stays on the domain entry, and only `markdown-ast` may import `marked`, and only `Lexer` and its types (ESLint `allowImportNames`; `check:rn-bundles` builds it as its own entry with the sanitizers still banned). The rest of `marked` (its HTML parser) ships unused: about 45 KB minified, 14 KB gzipped. Metro resolves `marked` from the workspace root `node_modules`, the same copy the web uses.
- **No HTML.** Raw HTML never renders as markup: tags are dropped and their text kept, and `script`, `style`, `textarea`, `option` and `xmp` lose their content, as in the web sanitizer. Inline formatting tags such as `<b>` therefore show as plain text, where the web preview keeps them. Entities decode to text (common named ones and all numeric ones).
- **Links.** A link exists only when `isSafeLinkHref` accepts it with `POST_LINK_SCHEMES` (images: `http` / `https`); anything else renders as its text. Root-relative links and images resolve against `https://notebook.gagnechris.com`. `http(s)` links open in `SFSafariViewController` (`expo-web-browser`), `mailto:` and `tel:` through `Linking`; `onLinkPress` overrides both.
- **Task embeds.** `{{task:<ULID>}}` lines (see [data-model.md](./data-model.md#task-embeds)) split the body as on the web and render through the `renderTaskEmbed` prop, so the editor supplies live rows. Without it a line shows `taskEmbedFallbackLine` for the record in `embedTasks` (a missing record reads "(deleted task)"), so a raw token never shows.
- **Parity.** `EVERY_MARKDOWN_ELEMENT_TREE` (`@gagnechris/shared/fixtures/every-markdown-element`) is the web preview's DOM for the every-element fixture, reduced to tags, a few attributes and visible text. `packages/shared/src/markdown-ast.test.ts` checks the web output and the AST against it; `src/markdown/MarkdownView.test.tsx` checks the rendered native tree (each node's `testID` names its HTML element) against it, with `react-native` mocked as host components.
- **Performance.** Parsing a 20 KB note takes about 2 ms in Node and rendering it with `react-test-renderer` about 8 ms; both tests fail above generous budgets. Top-level blocks are memoized, so a re-render with the same markdown skips them.
- **Dev route.** In dev builds `gagnechris://dev/markdown` shows the every-element fixture with task embeds and unsafe input, and `gagnechris://dev/markdown?size=20480` a 20 KB note, logging `[markdown] <n> chars laid out in <ms> ms`. Release builds redirect it to `/`.

## Native modules

Every module listed in `expo/bundledNativeModules.json` uses exactly the range given there (React is the exception; see [React versions](#react-versions)); `src/native-config.test.ts` fails on drift. Adding or removing a native module needs a new dev client build; JS-only changes do not.

| Module                                                                                                       | Use                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expo-router` (+ `react-native-screens`, `react-native-safe-area-context`, `expo-linking`, `expo-constants`) | File-based navigation in `app/`                                                                                                                                                                                           |
| `expo-dev-client`                                                                                            | Debug builds open the dev launcher instead of Expo Go                                                                                                                                                                     |
| `expo-auth-session`, `expo-web-browser`                                                                      | Cognito managed login in `ASWebAuthenticationSession`                                                                                                                                                                     |
| `expo-secure-store`                                                                                          | Tokens in the Keychain                                                                                                                                                                                                    |
| `expo-crypto`                                                                                                | `crypto.getRandomValues` for `createUlid`                                                                                                                                                                                 |
| `@react-native-async-storage/async-storage`                                                                  | Cache store for cached reads (with TanStack's async-storage persister)                                                                                                                                                    |
| `@react-native-community/netinfo`                                                                            | Online / offline state                                                                                                                                                                                                    |
| `expo-sqlite`                                                                                                | Local database for the later offline outbox                                                                                                                                                                               |
| `expo-build-properties`                                                                                      | iOS deployment target **17.4** (the minimum for an `https` callback in `ASWebAuthenticationSession`) and `enableSceneSupport`: apps built with the iOS 27 SDK trap at launch unless they adopt the UIKit scene life cycle |
| `expo-font`                                                                                                  | Embeds the Inter `.ttf` files at build time                                                                                                                                                                               |
| `expo-symbols`                                                                                               | SF Symbols for the tab bar and icons                                                                                                                                                                                      |
| `expo-haptics`                                                                                               | Haptic on completing a task in a note                                                                                                                                                                                     |
| `@react-native-community/datetimepicker`                                                                     | Pick a date… in the note editor                                                                                                                                                                                           |

SQLite is installed so the dev client already contains it; no code uses it yet.

`app.json` registers the config plugins for `expo-router`, `expo-font`, `expo-web-browser`, `expo-secure-store`, `expo-sqlite`, and `expo-build-properties`. `ios/` and `android/` are generated by `expo prebuild` (or `expo run:ios`) and are gitignored.

## Cached reads and offline

The v1 policy from ADR 0004: cached reads, online edits. The code is in `src/cache/` and `src/net/`.

- **Persisted cache.** `CachedQueryProvider` (`sub`: the signed-in user's Cognito `sub`, or `null`) persists the query cache to AsyncStorage under `gagnechris.queryCache` with `@tanstack/query-async-storage-persister` (1 s throttle). It restores before queries run (`IsRestoringProvider`), so last-seen data renders with no network. The root layout passes the session user's `sub`.
- **What is persisted** (`isPersistedQueryKey` in `src/cache/policy.ts`): Notebook notes and tasks queries that hold data (including one whose refetch just failed, so an unreachable server never deletes the saved copy) under the app-core keys `list`, `detail`, `batch` and `daily`. Search queries, a notes list filtered by a search term, `daily-dates` (its data is a `Set`) and everything else stay in memory only. Persisted keys get a `gcTime` of 30 days so a restore keeps them.
- **Expiry and versioning.** `maxAge` is 30 days. The buster is `<CACHE_SCHEMA_VERSION>:<sub>`; a stored cache from another schema version or another user is deleted on restore. Bump `CACHE_SCHEMA_VERSION` when a persisted query's data shape changes.
- **Connectivity.** `startConnectivity()` feeds NetInfo into TanStack's `onlineManager` (only `isConnected === false` counts as offline) and `AppState` into `focusManager`. Offline, queries pause and keep their cached data, and `NetworkStatus` shows "Offline — showing saved copy".
- **Edits.** Editors pass `nativeRetrySignals` as app-core's `retrySignals`: a held save retries when `onlineManager` goes back online and when `AppState` becomes `active`. `EditorOfflineNotice` shows "Offline — will save when connected" in an editor with an unsaved draft. Edits whose editor has closed stay in app-core's pending-save queue; `NetworkStatus` shows their count ("2 unsaved edits") until the queue is empty. Held edits are in memory only.
- **Sign-out.** `wipeLocalData()` from `src/cache` stops the persister (later and throttled writes are dropped), runs `queryClient.clear()` and `clearPendingFlushes()`, then `AsyncStorage.clear()`. The root layout passes it to `SessionProvider` as `wipe`, which runs it on sign-out and before a different user's first render, not on session expiry (the buster's `sub` covers that). `signOutWarning()` builds More's "N unsaved edits will be lost." message. Token revocation and Keychain deletion follow it, in [Sign-in](#sign-in). AsyncStorage lives in Application Support, which iOS excludes from backups, under the default Data Protection class.
- `@tanstack/react-query-persist-client` and `@tanstack/query-async-storage-persister` are pinned to the installed `@tanstack/react-query` version (`src/native-config.test.ts` checks), so one `query-core` is bundled.

## Run in the simulator

Simulator builds need Xcode and an iOS Simulator runtime, but no Apple Developer membership or signing.

Local build (needs Xcode):

```bash
npm ci --prefix apps/mobile
npm run local:dev                      # terminal 1: local API on :8787
npm run ios --prefix apps/mobile       # terminal 2: expo run:ios
```

`npm run ios` runs `expo run:ios`: it prebuilds `ios/`, installs pods, builds the debug dev client, installs it on a booted simulator (or picks one), and starts Metro. Later JS-only changes reload from Metro; rerun it after a native module or `app.json` change (with `npx expo prebuild --platform ios --clean` first if `app.json` changed). To skip the native build when the dev client is already installed, run `npm start --prefix apps/mobile` and press `i`.

With Xcode 27, `expo run:ios` stops with "No code signing certificates are available": `xcrun devicectl` lists booted simulators as connected devices, and Expo CLI treats them as phones. `npm run ios:sim` does the same build without it:

```bash
cd apps/mobile
npx expo start --dev-client --port 8081   # terminal 2: Metro
npm run ios:sim                           # terminal 3: build, install, launch on the booted iPhone simulator
```

`scripts/ios-sim.sh` takes a simulator UDID (default: the first booted iPhone), `METRO_PORT` and `SKIP_BUILD=1`, and launches with `--initialUrl`, which the dev launcher opens without the "Open in gagnechris?" prompt that `simctl openurl` shows.

EAS simulator build (builds in the cloud; needs an Expo account and `eas login`):

```bash
cd apps/mobile
npx eas-cli build --profile development --platform ios
```

The `development` profile in `eas.json` sets `developmentClient: true` and `ios.simulator: true`, so the result is a `.app` for the simulator. EAS offers to install it on a booted simulator when the build finishes (or run `npx eas-cli build:run --profile development --platform ios --latest`); then start Metro with `npm start`.

`eas.json` also defines `preview` (internal distribution) and `production` (`autoIncrement: true`, with `appVersionSource: "remote"` so EAS owns the build number). Both build for devices and sign with the Team ID in `app.json`; `eas.json` sets the same Team ID for `submit`.

## What it imports

- `@gagnechris/shared` (domain Zod schemas) and `@gagnechris/shared/markdown-ast`
- `@gagnechris/api-client` (`TokenProvider` + OpenAPI client)
- `@gagnechris/app-core` (UI-free admin hooks)
- `@gagnechris/tokens` (numeric color/space tokens for RN `StyleSheet`)

Metro config (`metro.config.js`) watches the repo root, sets `nodeModulesPaths` and `disableHierarchicalLookup`, enables package exports, and remaps NodeNext `.js` specifiers to `.ts`/`.tsx` (only for relative imports from first-party files, never `node_modules`), so shared packages need no separate compile step. Package `exports` on the shared packages include a `react-native` condition.

## API target and auth

- `EXPO_PUBLIC_API_BASE_URL` sets the API origin; the default is the local API at `http://127.0.0.1:8787` (`npm run local:dev`).
- `EXPO_PUBLIC_AUTH_MODE` is `local` or `cognito`. Unset, it is `local` against a local API and `cognito` otherwise. `local` only takes effect in dev builds (`__DEV__`); a release build always uses Cognito.
- `TokenProvider` in `@gagnechris/api-client` accepts `{ forceRefresh?: boolean }`. On a 401 or 403 the client calls it once with `forceRefresh: true` and retries the request once with the new token. Requests already in flight when a refresh starts share it, so concurrent 401s cause one refresh. If the refresh throws or returns no token, the caller gets the original response.

## Sign-in

`src/auth/backend.ts` (`createAuthBackend`) holds the session for both modes; a `TokenIssuer` supplies the mode-specific parts.

| Mode      | Issuer                | Sign-in                                                                                                                                                                                                                                           |
| --------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cognito` | `src/auth/cognito.ts` | Managed login on `EXPO_PUBLIC_COGNITO_DOMAIN` (default `auth.gagnechris.com`) in `ASWebAuthenticationSession` with `expo-auth-session`: authorization code, PKCE `S256`, scopes `openid email profile`, ephemeral session                         |
| `local`   | `src/auth/local.ts`   | No browser: stores `local-ios:local-dev-user`, which the local API maps to `ios`-audience claims. `EXPO_PUBLIC_LOCAL_AUTH_GROUPS` (comma-separated, default `site-admin,notebook,user-admin`) sets the groups; `site-admin` alone shows No access |

- **Config** (`src/config.ts`): `EXPO_PUBLIC_COGNITO_IOS_CLIENT_ID` is the public `ios` app client ID (SSM `/gagnechris/prod/cognito-ios-client-id`; not a secret). `IOS_CLIENT_ID` in the same file is the built-in default. `cognitoConfig` spreads one of `IOS_AUTH_REDIRECTS`: `scheme` (`gagnechris://auth/callback`, logout `gagnechris://`) is the default and the only one that works in the simulator; `universalLink` (`https://notebook.gagnechris.com/ios/auth/callback`, logout `/ios/auth/signed-out`, `preferUniversalLinks: true`) needs a signed build with the notebook host's `webcredentials` entitlement and the AASA served. Switching is that one spread.
- **Tokens:** `expo-secure-store`, one Keychain item each for the refresh token, ID token, `sub` and sign-in time, all with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (`KEYCHAIN_OPTIONS` in `src/auth/index.ts`). The app sends the ID token. `getToken` returns it while it has more than a minute left, else refreshes (`refreshAsync`, the `refresh_token` grant). Refresh is single flight: concurrent callers share one request, and the rotated refresh token is in the Keychain before any of them gets the new ID token. The app keeps one API client, so its own single-flight retry applies across screens too.
- **Expiry:** `invalid_grant` on refresh ends the session: the tokens go, the cache and `sub` stay, and sign-in says "Your session ended". A network failure keeps the tokens. If a different `sub` signs in next, `wipe` runs before the first render.
- **Relaunch:** `restore()` reads the Keychain, so a killed app comes back signed in. AsyncStorage holds an install marker (`gagnechris.installed`); a launch without one deletes the Keychain items first, because Keychain items outlive an uninstall. The marker is written again after each sign-in, since sign-out clears AsyncStorage.
- **Sign-out:** More's confirmation warns "N unsaved edits will be lost." (`signOutWarning`) when the pending-save queue isn't empty. Then `wipe` (`wipeLocalData`, see [Cached reads and offline](#cached-reads-and-offline)), then the refresh token is revoked (`/oauth2/revoke`, best effort), then the Keychain items are deleted. With `ephemeralSession: false` (the fallback if passkeys fail in an ephemeral session) it also opens `/logout` with the configured `logout_uri`, and "Use a different account" adds `prompt=login`.
- **Access:** the `notebook` group comes from the ID token's `cognito:groups`; without it the app shows No access.

### iOS sign-in and associated domains

- Expo `scheme` is `gagnechris`. The Cognito `ios` app client (public, PKCE) has the callbacks `https://notebook.gagnechris.com/ios/auth/callback` and `gagnechris://auth/callback`, and the logout URLs `https://notebook.gagnechris.com/ios/auth/signed-out` and `gagnechris://`. Sign-in must use the https redirect and pass `preferUniversalLinks: true` to `promptAsync`, so `ASWebAuthenticationSession` matches the callback by host and path (iOS 17.4+) and returns it only to an app the notebook host's AASA lists under `webcredentials`. The custom scheme stays on the client until the app's sign-in uses the https callback, then goes ([ADR 0004](./adr/0004-ios-app.md#5-auth-callback)). The `/api/notebook` authorizer and router accept tokens from `notebook-web` and `ios`; `/api/admin` (including `/api/admin/users`) accepts only `admin-web`, so the app's Admin space needs its own change. The local API maps `Bearer local-ios:<sub>` to ios-audience claims.
- iOS bundle id is `com.gagnechris.mobile` and the Apple Team ID is `FF9YB7FZ7A` (`ios.appleTeamId` in `app.json`, `submit.production.ios.appleTeamId` in `eas.json`), so the app ID in both AASA files is `FF9YB7FZ7A.com.gagnechris.mobile`. `app.json` lists the associated domains `applinks:notebook.gagnechris.com`, `webcredentials:notebook.gagnechris.com` and `webcredentials:gagnechris.com`. Changing them needs a new dev client build.
- Each host serves its own `/.well-known/apple-app-site-association`, never redirected (Apple fetches it without following redirects); deploy forces `Content-Type: application/json`:
  - Apex (`apps/web/public/.well-known/`): `webcredentials` only, no `applinks`. The apex also serves `/.well-known/webauthn`.
  - `notebook.gagnechris.com` (`apps/web/public-notebook/.well-known/`): `applinks` for `/today`, `/notes/*` and `/tasks/*`, with `"exclude": true` on `/auth/*` so web sign-in on an iPhone with the app installed stays in the browser, and `webcredentials` for the app. The https sign-in callback needs `webcredentials` on its host; `applinks` don't count, and without the association iOS doesn't start the session ("Using HTTPS callbacks requires Associated Domains using the `webcredentials` service type", [Apple: `Callback.https(host:path:)`](<https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession/callback/https(host:path:)>), [Apple Developer Forums](https://developer.apple.com/forums/thread/763621)). `/ios/*` is not in `applinks`, so a stray link to the callback opens the website.
- The notebook web app serves `/ios/auth/callback` and `/ios/auth/signed-out` outside the signed-in shell: a page that says to finish in the app, for a browser without it. The app's sign-in sheet catches those URLs before they load.
- Apple's CDN caches each AASA file for hours, and devices fetch it from the CDN, not the host. After an AASA change check what Apple serves: `curl https://app-site-association.cdn-apple.com/a/v1/notebook.gagnechris.com` (and `.../a/v1/gagnechris.com`).
- **Passkey RP ID** is `auth.gagnechris.com` (see [ADR 0001](./adr/0001-passkey-rp-id.md)). iOS sign-in uses managed login in `ASWebAuthenticationSession`, not native `ASAuthorization` against the apex.
- Every Cognito client has 1-hour ID and access tokens and a 30-day refresh token with rotation on (30 s grace) in `infra/lib/stacks/auth-stack.ts`. A rotated refresh token keeps the original expiry, so a session ends 30 days after the interactive sign-in however often it refreshes.

## Install layout: not a root workspace

`apps/mobile` is **outside the root `workspaces`** and keeps its own `apps/mobile/package-lock.json`, so web / API / infra installs and CI jobs never install Expo and React Native.

First-party packages are linked with `file:` specifiers (`"@gagnechris/shared": "file:../../packages/shared"`), so Metro and `tsc` read the TypeScript sources with no build step.

Consequences:

- Install mobile deps with `npm ci` (or `npm install`) **inside `apps/mobile`** — a root install does not cover it.
- Root `npm run typecheck` / `npm test` / `npm run lint` do not include mobile. Use `--prefix apps/mobile`; the Mobile workflow does this.
- Adding a dependency to `packages/*` needs `npm install` in `apps/mobile` too, to refresh its lockfile.
- Add Expo native modules with `npx expo install <package>` inside `apps/mobile`, then check the range matches `node_modules/expo/bundledNativeModules.json` (`expo install` can pick the newest SDK patch's list; `src/native-config.test.ts` fails on a mismatch).

## React versions

Root and `apps/mobile` are both on React **19.3.0**. React Native 0.86.3 declares `react: ^19.2.3`, so the root version satisfies it.

The two lockfiles produce two copies on disk, which is harmless at runtime (Metro's `nodeModulesPaths` puts `apps/mobile/node_modules` first) but not in tests: a bare `react` or `@tanstack/react-query` import from app-core resolves to the root copy, and two instances break hooks. `apps/mobile/vitest.config.mts` sets `resolve.dedupe: ['react', '@tanstack/react-query']`, and `src/app-core.test.ts` renders an app-core autosave hook (`useQueuedAutosave`) plus a versioned-resource query hook (`createVersionedResource`) so a duplicate fails the suite rather than surfacing as a confusing "invalid hook call" / "Cannot read properties of null (reading 'useContext')".

## Zod version

`apps/mobile` pins `"zod": "^4.6.5"`. Expo CLI depends on `zod@3` transitively; without the pin that copy can be hoisted into `apps/mobile/node_modules/zod`, and with `disableHierarchicalLookup` Metro would resolve shared's `import 'zod'` to v3 while shared typechecks against v4. `check:bundle` rejects v3 paths.

## CI

`.github/workflows/mobile.yml` uses no AWS credentials. It runs on every PR and push to `main` so the required check **Mobile typecheck, lint, test, bundle** always reports; an in-job `dorny/paths-filter` step skips the steps below (the job still passes) unless mobile, the client packages, the root lockfile or the workflow changed. When it applies, it runs:

1. Root `npm ci`, then `npm ci` in `apps/mobile`.
2. Typecheck for `shared`, `api-client`, `tokens`, `app-core`, and mobile; **test** for `api-client`, `tokens`, `app-core`, and mobile (not `shared` — shared tests run in root CI); lint for mobile.
3. `npm run export:ios` — `expo export --platform ios --source-maps`.
4. `npm run check:bundle` — fails if any sourcemap lists a `.d.ts` source, if zod is missing, if `zod/v3/` appears, if `zod/v4/` is absent, or if no sources come from app-core, `@tanstack/react-query`, `@tanstack/query-async-storage-persister`, `@react-native-community/netinfo`, `expo-crypto`, or `expo-router`.
5. `npm run smoke:bundle` — builds a Metro bundle from `scripts/smoke-entry.ts` with the app's real `metro.config.js` and **executes it in Node**: it evaluates shared Zod schemas, runs the Notebook view logic (`bucketTodayTasks`, `groupUpcomingTasks`), parses markdown with `parseMarkdownBlocks`, asserts Zod 4 APIs (`z.email`), generates a ULID with the native `crypto` removed and the app's `getRandomValues` installer in its place, and renders app-core's `createVersionedResource(...).useQuery` with `react-test-renderer` under `AppApiProvider` + `QueryClientProvider` until the query resolves. A second React or react-query copy in the Metro graph fails that render.

A successful `expo export` alone does not prove the bundle runs: a resolver that maps `.js` to `.d.ts` inside `node_modules` (for example `zod/v4/classic/external.js`) exports cleanly, then throws `TypeError: undefined is not a function` at module load. Step 4 reports the `.d.ts` sources and step 5 fails (e.g. `TypeError: _zod.z.literal is not a function`).

`tokens:check` in the main CI workflow regenerates `packages/tokens/src/variables.css` and fails on drift, the same way `openapi:check` guards the API contract.

## Design tokens

`tokens.text`, `tokens.space`, and `tokens.radius` are **px numbers**, so RN uses them directly (`padding: tokens.space[4]`). The generator converts them to `rem` for CSS and derives the `/* 16px */` comments from the values. Colors, shadows, transitions, and fonts are CSS-ready strings.

## Verification

```bash
cd apps/mobile
npm ci
npm run typecheck
npm test
npm run export:ios && npm run check:bundle
npm run smoke:bundle
```

The bundle smoke runs in Node, not Hermes, and does not load native modules; only launching on a simulator or device (see [Run in the simulator](#run-in-the-simulator)) exercises the RN runtime and the native expo-crypto call.
