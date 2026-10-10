# ADR 0003: One renderer for public pages

**Status:** Accepted (2026-10-06): option (a), React rendered by the publisher and hydrated by the public app. The posts index, the site chrome, the 404 page, Contact, the Bears shells, the Projects index, Home and the project page use it; the other pages follow the order in §8.  
**Context:** Every public page body is built twice: a string renderer in `packages/shared` (`post-html.ts`, `project-html.ts`, `resume-html.ts`, `home-html.ts`, `site-chrome-html.ts`, `public-pages-html.ts`, about 950 lines) for the publisher and the Vite build, and a React twin in `apps/web` for the SPA. Parity tests keep each pair in step, the twins are written to avoid React's `<!-- -->` text separators, and the SPA parses each prerender back into a view model (`fromPrerender`) because `createRoot` throws the prerendered DOM away.

## Decision summary

| Area             | Decision                                                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer         | One set of router-free React components in `packages/public-ui` (`@gagnechris/public-ui`). The publisher renders them with `renderToString` from `@gagnechris/public-ui/server`; the public app hydrates them.                                           |
| Props            | Each component takes a view model from `@gagnechris/shared` that holds exactly what the page prints, already ordered and formatted (`postsIndexView`). The publisher builds it from DynamoDB items, client navigation from `posts.json` or fetched HTML. |
| Links            | `PublicLink` reads a component from `PublicLinkContext`: plain `<a>` by default (publisher), `SiteLink` in the public app (`AppWithTracking`). ESLint keeps React Router out of the package.                                                             |
| Mount            | `mountApp` hydrates when the page is in `HYDRATED_PAGES` and its prerender is present, and calls `createRoot` otherwise. When every page has moved, it always hydrates and the list goes.                                                                |
| Hydration data   | Read back from the published DOM by a parser that is the exact inverse of the component (`postsIndexFromDocument`), so no data island is added to the HTML.                                                                                              |
| Publisher bundle | React and `react-dom/server` are bundled, with `process.env.NODE_ENV` defined as `production` (`PUBLISHER_BUNDLE_DEFINE`); `infra/test/publisher-bundle.test.ts` fails if a development build gets in.                                                   |
| CSP              | No change. Hydration adds no inline script. SSR stays on `renderToString` with no Suspense boundaries in the server tree, because React's streaming renderers write inline scripts.                                                                      |

## 1. Options

**(a) React components rendered by the publisher, hydrated by the SPA.** Router-free presentational components with an injected link. The publisher calls `react-dom/server`; the SPA calls `hydrateRoot`. The `*-html.ts` body renderers, their React twins and the parity tests go away, and each parser becomes the inverse of one view model.

**(b) Shared view-model builders with two thin templates.** All ordering, grouping, formatting and conditionals move into builders in `@gagnechris/shared`; the string renderer and the React twin become logic-free templates over the same view model.

| Concern                       | (a) one React renderer                                                                                                                | (b) view models, two templates                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Markup written                | once                                                                                                                                  | twice per page, still kept in step by parity tests   |
| Parity tests                  | gone; a round-trip test (`parse(render(view))` equals `view`) per page                                                                | stay                                                 |
| `fromPrerender` parsers       | stay until data islands are worth it, but become exact inverses of the props                                                          | stay                                                 |
| Cold load                     | `hydrateRoot` keeps the published DOM: no second paint, no new LCP candidate                                                          | `createRoot` still replaces `#root`                  |
| `<!-- -->` workarounds        | gone: the server and client are the same renderer                                                                                     | stay                                                 |
| Publisher bundle / cold start | +235,572 B minified (+9.7%), about +7 ms module load locally (§2)                                                                     | unchanged                                            |
| Demo kit and admin previews   | render the components directly                                                                                                        | keep printing strings into `dangerouslySetInnerHTML` |
| Escaping                      | React's                                                                                                                               | two escapers that must agree                         |
| New failure mode              | hydration mismatch, which React recovers from by rendering on the client (today's behaviour) and reports through `onRecoverableError` | none new                                             |

The view models from (b) are needed by (a) anyway: they make the parser lossless, which is what lets hydration match. So the decision takes (b)'s builders and drops its second template.

## 2. Measurements

All numbers come from the posts index spike, on an Apple Silicon Mac with Node 22.23.

**Publisher bundle.** esbuild with the `NodeLambda` settings (CJS, `node24`, minified, source maps, the publisher's externals). `cdk synth` produced the same 2,658,838-byte `index.js` for the publisher asset.

| Build                                     | `index.js` raw | gzip    | zip (js + map) |
| ----------------------------------------- | -------------- | ------- | -------------- |
| String renderer                           | 2,423,266      | 868,076 | 2,893,491      |
| React, `NODE_ENV` defined as `production` | 2,658,838      | 937,607 | 3,157,505      |
| React, no `NODE_ENV` define               | 3,040,643      | —       | —              |

Of the 235,572 added bytes, `react-dom` is 225,403, `react` 8,563 and `public-ui` 1,525. Without the define, esbuild bundles both React builds and Lambda (which sets no `NODE_ENV`) would run the development one.

**Publisher cold start.** Module load of the whole bundle (`require` in a fresh `node` with `--enable-source-maps`, 40 runs, two interleaved rounds): p50 155.2 ms before, 162.3 ms after, so about +7 ms. Of that, loading React and `react-dom/server` alone is 7.6 ms, and the first render of a 40-post index costs 3.5 ms against 0.3 ms for the string renderer (warm: 0.16 ms against 0.09 ms). The Lambda has 512 MB on arm64, which gets a fraction of a vCPU, so expect a few times that on a cold start (an estimate of roughly 20 to 35 ms); the `Init Duration` in the publisher's `REPORT` lines after deploy gives the real figure. The publisher consumes a DynamoDB stream, so its cold start is never on a visitor's request.

**Public entry.** `dist/assets/index-*.js` went from 466,223 to 467,741 bytes (gzip -9: 142,465 to 143,078, +613). `hydrateRoot` lives in the `react-dom/client` module the entry already ships. The CSS, `jsx-runtime` and `preload-helper` chunks are byte-for-byte unchanged.

**Page.** A 40-post `/posts` built from the publisher's output and the built app, served locally with gzip.

| Run                                                                              | Before                                                                           | After                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Lighthouse 12.8.2, mobile preset (simulated throttling), median of 5             | score 89, FCP 2.71 s, LCP 3.09 s, TBT 0 ms, CLS 0, SI 2.71 s                     | score 89 to 90, FCP 2.71 s, LCP 3.08 to 3.09 s, TBT 0 ms, CLS 0, SI 2.71 s |
| Playwright, Chromium, 4x CPU throttle, observed LCP, median of 15 (three rounds) | 172 to 228 ms                                                                    | 52 to 72 ms                                                                |
| `#root` children added or removed after parsing                                  | 8 (both comments, header, main and footer out; a new header, main and footer in) | 0                                                                          |
| Console errors                                                                   | 0                                                                                | 0                                                                          |

Lighthouse models LCP from the network trace, so it sees no difference. In the browser, `createRoot` inserts a new `<main>` whose paint becomes a later LCP candidate; hydration keeps the parsed one.

## 3. Published HTML

The posts index HTML was compared byte for byte, old renderer against new, for four lists: empty, 40 posts over four years, titles and excerpts with `& < > " '` and curly quotes, and two posts on one day. The empty list is identical. The others differ in two ways only, and each pair parses to the same DOM (jsdom serialisations are identical):

| Old                   | New                   | Why it is safe                                                                                                                                                   |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<time datetime="…">` | `<time dateTime="…">` | HTML attribute names are case-insensitive and the parser lowercases them; `getAttribute('datetime')` and CSS still match. React prints the prop name as written. |
| `&#39;`               | `&#x27;`              | Both are character references to U+0027.                                                                                                                         |

Strings that match the publisher's HTML (`services/publisher/test/render.test.ts`, the publisher snapshot) now expect React's spelling. Later pages will also print `<!-- -->` between adjacent text nodes; the parsers read `textContent`, which skips comments.

## 4. Hydration mismatches

A mismatch is not a broken page: React 19 throws the server DOM away and renders on the client, which is what `createRoot` does on every page today, and reports it to `onRecoverableError` (the console, for now). The strategy is to keep the first client render a pure function of the published page:

- **Props are what the page prints.** View models hold formatted strings (dates as `Sep 28`, `datetime` values, year labels) in display order, so the parser reads back the exact props. The old posts parser read only the date from `datetime` and sorted again, which tied posts published on the same UTC day and broke the tie on id, so a cold load could swap them; the view model fixes that (`PostsIndexBody.test.tsx` covers the case).
- **No clock, locale or time zone in render.** Dates are UTC already. The footer year is the one exception today: `useFooterYear` returns the published year as `useSyncExternalStore`'s server snapshot, so hydration matches and the live year renders straight after (`coldLoadParity.test.tsx` runs it a year later).
- **Client-only parts mount after hydration.** The phone menu's focus trap, analytics and the project demos already attach in effects or lazy chunks behind a static preview. Server trees have no Suspense boundaries.
- **Raw HTML stays raw.** Post and project bodies and the home about text are sanitised HTML strings in `dangerouslySetInnerHTML`. React keeps that HTML as published during hydration (development builds only warn on a difference), so the parser can read it back with `innerHTML`.
- **Stale pages.** A page published before a markup change mismatches until it is republished and falls back to a client render. For the posts index the old and new HTML parse to the same DOM, so old pages hydrate too.
- **Tests.** Per page: a round-trip test of parser and component, a `coldLoadParity.test.tsx` case that hydrates the publisher's output and expects no recoverable error and the same `<main>` element, and the e2e check in `e2e/tests/public-posts-index.spec.ts` (the parsed `<main>` becomes React's, no console errors, links navigate in the app).

Data islands (`<script type="application/json">`) would remove the parsers but repeat every field in the HTML, the post body twice. They are worth it only for a view whose markup doesn't carry its data; none does today.

## 5. CSP

The public policy (`csp()` in `infra/lib/constructs/site-hosting.ts`) allows scripts from `'self'` and the Google Analytics hosts, with no `'unsafe-inline'`. Hydration loads nothing new and writes no inline script, so it needs no change. Two rules follow:

- **SSR uses `renderToString`** (or `react-dom/static`, which waits for everything). `renderToPipeableStream` writes inline `<script>` tags to fill Suspense boundaries, which this policy blocks.
- **A data island, if ever added, must be `type="application/json"`.** Browsers don't run a script element whose type isn't JavaScript, so `script-src` doesn't apply to it; check that in each browser before relying on it.

`style-src 'unsafe-inline'` is unaffected: React writes `style` props as attributes.

## 6. Demo kit and admin previews

- **Posts demo** (`src/demos/posts/`) prints `renderPostArticleHtml` and `renderHomeRecentPostsHtml` into `dangerouslySetInnerHTML` and catches link clicks to keep the visitor in the demo. With the post and home components in `public-ui`, it renders them directly and provides its own `PublicLinkContext` component that keeps navigation inside the demo. It stays a lazy chunk; the components it shares with the pages are already in the entry.
- **Admin previews** (`AdminHomePage`, `AdminResumePage`, `BodyPreview`) render the same components with a link component that points at the public host, in place of rewriting the HTML string with `withPublicUrls` (image URLs in markdown bodies still go through it).
- **The kit** (`src/kit/`) is unaffected: `public-ui` holds public page markup, the kit holds workspace controls and the demo frame. `public-ui` never imports the kit or anything else in `apps/web` (ESLint).
- **Mobile** renders natively and never imports `public-ui`, which needs `react-dom`.

## 7. What each page loses

| Page                    | String renderer (`packages/shared/src`)                                    | React twin (`apps/web/src`)                         | Parity test                             | Parser                                                 |
| ----------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| Posts index             | gone                                                                       | gone                                                | gone                                    | `postsIndexFromDocument` (inverse of `postsIndexView`) |
| Site chrome             | `site-chrome-html.ts`                                                      | `components/SiteChrome.tsx`                         | `SiteChrome.test.tsx`                   | none (`useFooterYear` reads the year)                  |
| 404, Contact, Bears     | `public-pages-html.ts`                                                     | `pages/NotFound.tsx`, `pages/Contact.tsx`           | `NotFound.test.tsx`, `Contact.test.tsx` | `notFoundPrerender.ts`                                 |
| Projects index and card | `project-html.ts` (`renderProjectsIndexBodyHtml`, `renderProjectCardHtml`) | `projects/ProjectsIndexBody.tsx`, `ProjectCard.tsx` | `ProjectCard.test.tsx`                  | `projects/publishedProjects.ts`                        |
| Home                    | `home-html.ts`                                                             | `App.tsx`                                           | `App.test.tsx`                          | `home/publishedHome.ts`                                |
| Project page            | `project-html.ts` (`renderProjectPageBodyHtml`)                            | `projects/ProjectPageBody.tsx`                      | `ProjectPageBody.test.tsx`              | `projects/publishedProject.ts`                         |
| Post page               | `post-html.ts`                                                             | `posts/PostArticle.tsx`                             | `PostArticle.test.tsx`                  | `posts/publishedPost.ts`                               |
| Resume                  | `resume-html.ts`                                                           | `pages/Resume.tsx`                                  | `Resume.test.tsx`                       | `resume/publishedResume.ts`                            |

`page-landmarks.test.ts` and `publicLandmarks.test.tsx` collapse into one landmarks test over the `public-ui` server output. `coldLoadParity.test.tsx` stays and becomes the hydration test for every page. RSS, the sitemap, `posts.json` and the resume PDF don't render HTML pages and are unaffected.

## 8. Migration order

Each step moves one page, or one shared part, into `public-ui` with its view model, deletes the string renderer and the twin, turns the parity test into a round-trip test, adds the page to `HYDRATED_PAGES` with a `coldLoadParity.test.tsx` hydration case, and updates `docs/architecture.md`.

1. **Site chrome, 404, Contact and the Bears shells.** Every page hydrates the chrome, so it goes first. `renderSitePageHtml` becomes a component that wraps a page body; the Vite build (`apps/web/scripts/staticPageMeta.ts`) calls the `/server` entry for the static pages and `404.html`. The phone menu's `<details>` stays the no-JavaScript fallback.
2. **Projects index and the project card.** The card is shared with Home, so it lands before Home.
3. **Home.** Hero, Recent posts and What I'm building; the about text stays sanitised HTML. The admin Home preview switches to the component.
4. **Project page.** Back link, body, Build log and the Try it slot. Hydration must keep the slot's static preview; the demo replaces it after it loads, as now.
5. **Post page.** Meta line, body, Part of, author note and `data-minutes`. The posts demo and the admin post preview render the component.
6. **Resume.** The largest renderer. `resume-view.ts` is already the view model and the PDF keeps using it. The admin Resume preview switches to the component.
7. **Clean up.** `mountApp` always hydrates and `HYDRATED_PAGES` goes; `@gagnechris/shared/render` keeps only markdown rendering, page meta and the HTML helpers; the `site-chrome` and `public-pages` entries go; the two landmarks tests become one.

## 9. Risks

- **Publisher size and cold start:** +9.7% bundle and some tens of milliseconds of init on the 512 MB Lambda (§2). Acceptable for a stream consumer; worth reading `Init Duration` after the first deploy.
- **`NODE_ENV`:** the define also turns on production branches in every other bundled library (1,469 fewer bytes outside React). `publisher-bundle.test.ts` pins that only production React is bundled.
- **One React copy:** server and client must run the same React release, or the server markup can drift from what the client expects. The root lockfile has one hoisted `react` and `react-dom`; keep `public-ui`'s React as a peer dependency.
- **Serialisation:** React's spelling differs from the string renderers (`dateTime`, `&#x27;`, `<!-- -->`). Anything that string-matches published HTML must expect it; parsers and CSS are unaffected.
- **`tsx`:** the local API and the e2e stack run the publisher through `tsx`, which reads one tsconfig for every file and would compile `public-ui`'s JSX to `React.createElement` with no `React` in scope. Each `.tsx` file in the package starts with `/** @jsxRuntime automatic */`, and `src/server.test.ts` fails on a file without it.
- **Silent fallbacks:** a mismatch costs the hydration benefit but shows no error to visitors, so a regression could go unnoticed. The tests in §4 catch it before merge; reporting `onRecoverableError` to analytics would catch it in production.
- **Deploy order:** CDK (publisher) and the web build deploy in one pipeline, so for a short time new HTML can meet the old app or the reverse. The worst case is today's client render.

## Follow-up tickets

1. Move the site chrome, 404, Contact and Bears shells to `public-ui` and hydrate them (§8 step 1).
2. Move the Projects index and project card to `public-ui` and hydrate `/projects` (§8 step 2).
3. Move Home to `public-ui`, hydrate `/`, and render the admin Home preview with it (§8 step 3).
4. Move the project page to `public-ui` and hydrate `/projects/<slug>` with the Try it slot (§8 step 4).
5. Move the post page to `public-ui`, hydrate `/posts/<slug>`, and render the posts demo and the admin post preview with it (§8 step 5).
6. Move the resume to `public-ui`, hydrate `/resume`, and render the admin Resume preview with it (§8 step 6).
7. Always hydrate, delete `HYDRATED_PAGES` and the remaining string page renderers and entries, and merge the landmarks tests (§8 step 7).
8. Report hydration recoverable errors from the public app to analytics.
9. After the next production deploy, record the publisher's cold-start `Init Duration` against the estimate in §2.
