# Public site redesign (B · Editorial)

Reference designs for the public site on `gagnechris.com`. The source is the
"Public Site Redesign" Claude design canvas, row B. Screenshots of each
artboard are attached to their Linear stories; they are not stored in this
repo. Row A is the rejected alternative.

| Artboard                | Size      | Shows                                                                                                                           | Story                                |
| ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| All B artboards         | —         | Site header (photo, name, Posts / Projects / Resume / Contact) and footer (©, RSS, Don't feed the bears)                        | CHR-219 (Projects link: CHR-228)     |
| Home                    | 1440×1700 | Name, italic title, About lede, inline links sentence, Recent posts, What I'm building (two project cards)                      | CHR-220 (What I'm building: CHR-228) |
| Post                    | 1440×1435 | Meta line (date · reading time), title, italic excerpt, serif body with h2 and lists, author note after a dark rule             | CHR-221                              |
| Posts                   | 1440×1000 | Title, italic description, Subscribe via RSS, posts grouped under year labels with short dates on the right                     | CHR-222                              |
| Resume                  | 1440×3576 | Title, italic headline, Summary lede, Download PDF / LinkedIn / Get in touch, dated experience, earlier roles collapsed, skills | CHR-223                              |
| Projects                | 1440×1532 | Title, italic intro, project entries with preview, status label, name, pitch, stack line                                        | CHR-228                              |
| Project Posts (demo)    | 1440×2200 | Project page template with the Posts demo (editor and public page side by side) and Build log                                   | CHR-229 (template), CHR-231 (demo)   |
| Project Notebook (demo) | 1440×2300 | Project page template with the Notebook demo (mini Today) and Build log                                                         | CHR-229 (template), CHR-232 (demo)   |

The PNG exports are 2×; measured values below are at 1×.

## Layout

| Item                | Value                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| Column              | 720px, centred (x 360–1080 on the 1440 artboard), 24px gutters                         |
| Ground              | White, no panels, cards or left stripes                                                |
| Header              | Photo top at 30px (measured); 44px tap targets, so the header row starts at 28px       |
| Header → first text | About 100px from the header row to the first line of page content (measured)           |
| Footer              | Last text line 48px above the page bottom (measured); at least 96px below page content |
| Demo slot           | Up to about 1100px wide (CHR-229)                                                      |

## Header and footer (measured)

| Element              | Value                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Photo                | 40px circle, 12px gap to the name                                                                         |
| Name                 | Newsreader 20px / 500, ink                                                                                |
| Nav links            | Inter 14px / 500, `neutral-700` (#384259); 12px horizontal padding, 4px between links (28px text to text) |
| Current nav link     | Inter 14px / 600, ink, 1px underline 6px below the baseline                                               |
| Nav right edge       | Last label ends 12px inside the column                                                                    |
| Footer text          | Inter 13px / 400, `neutral-600` (#4d5871); © on the left, links on the right                              |
| Footer links         | Underlined (1px, 3px offset), 20px apart, last one flush with the column                                  |
| At 390px (not drawn) | Name 18px, link padding 8px, 12px between name and nav; one row, wraps below 390px                        |

## Type scale

Values from the stories unless marked measured.

| Use                                  | Face       | Size / weight / line height                     | Story   |
| ------------------------------------ | ---------- | ----------------------------------------------- | ------- |
| Home name                            | Newsreader | 68px / 500                                      | CHR-220 |
| Home title line                      | Newsreader | italic 26px, `link` colour (measured)           | CHR-220 |
| Home About lede                      | Newsreader | 23px / 1.6                                      | CHR-220 |
| Home links sentence                  | Newsreader | 20px / 1.6 (measured)                           | CHR-220 |
| Home Recent posts title              | Newsreader | 30px / 500 (measured)                           | CHR-220 |
| Home Recent posts excerpt            | Newsreader | 19px, `inkSoft` (measured)                      | CHR-220 |
| Home Recent posts date               | Inter      | 13.5px, `neutral-600` (measured)                | CHR-220 |
| Post, Posts and Project titles       | Newsreader | 60px / 500                                      | CHR-221 |
| Post excerpt subtitle                | Newsreader | italic 24px                                     | CHR-221 |
| Post body                            | Newsreader | 21px / 1.7, measure about 680px                 | CHR-221 |
| Post h2                              | Newsreader | 32px / 500                                      | CHR-221 |
| Post meta (date · N min read)        | Inter      | 13px                                            | CHR-221 |
| Resume role ("Title _at Company_")   | Newsreader | 25px                                            | CHR-223 |
| Resume bullets                       | Newsreader | 18px                                            | CHR-223 |
| Resume date column                   | Inter      | tabular figures, 150px column                   | CHR-223 |
| Section labels (RECENT POSTS, years) | Inter      | about 13px / 600, uppercase, tracked (measured) | CHR-220 |
| Section label rule                   | —          | 1px ink, full column width (measured)           | CHR-220 |

## Post (measured)

| Element               | Value                                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Column                | 680px measure, centred (x 380–1060); 20px inside the 720px column                                                                                                                                                                        |
| Meta line             | Inter 13px, `neutral-600`; "February 1, 2026 · 1 min read"; cap top 102px below the header row                                                                                                                                           |
| Title                 | Newsreader 60px / 500, line height 1.1, -0.01em; 14px below the meta line                                                                                                                                                                |
| Excerpt               | Newsreader italic 24px / 1.4, `inkSoft`; 17px below the title                                                                                                                                                                            |
| Body                  | Newsreader 21px / 1.7 (35.7px lines), #22272d; paragraphs 1.2em apart; first line 48px below the excerpt                                                                                                                                 |
| h2                    | Newsreader 32px / 500, line height 1.25; 1.75em above, 0.5em below                                                                                                                                                                       |
| Links                 | `link`, underlined 1px at 0.18em offset (2px on hover)                                                                                                                                                                                   |
| Author note           | 64px below the body, 1px ink rule, 24px above the text; Newsreader 19px / 1.6, #2b3138; name in ink at 500                                                                                                                               |
| Reading time          | `readingMinutes`: words / 230, rounded, at least 1                                                                                                                                                                                       |
| Not drawn (our specs) | Blockquote: italic `inkSoft`, 2px ink rule. Code: system mono at 0.8em on `neutral-100`; blocks scroll in a bordered box. Figure caption: Inter 13px `neutral-600`. Tables scroll in their box; header rule ink, row rules `neutral-200` |
| At 390px (not drawn)  | Body 19px, title 40px, excerpt 20px, h2 26px, author note 17px                                                                                                                                                                           |

## Posts (measured)

| Element              | Value                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Column               | Full 720px column                                                                                                                                   |
| Title                | "Posts", Newsreader 60px / 500, line height 1.1; cap top 99px below the header row                                                                  |
| Intro                | "Ideas, lessons and experiments from software engineering, leadership and AI." Newsreader italic 24px / 1.4, `inkSoft`                              |
| Subscribe via RSS    | Inter 14px / 500, `link`, 1px underline 3px below the baseline, 44px target; links to `/rss.xml`                                                    |
| Year label           | Inter 13px / 600, tracked 0.12em, ink; 13px above a 1px ink rule across the column                                                                  |
| Entry                | One link: title Newsreader 28px / 500 (underlined on hover and focus), short date ("Feb 1") Inter 13px `neutral-600` on the right, baseline-aligned |
| Entry excerpt        | Newsreader 19px / 1.5, `inkSoft`                                                                                                                    |
| Entry spacing        | 25px above the title, 28px below the excerpt, 1px `neutral-200` rule between entries; 56px between years                                            |
| Order                | `groupPostsByYear`: years newest first (UTC), posts newest first; undated posts last under "Undated"                                                |
| At 390px (not drawn) | Title 40px, intro 20px, entry title 22px, excerpt 17px                                                                                              |

## Contact (not drawn)

There is no artboard; these values follow the Posts page.

| Element              | Value                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Column               | Full 720px column                                                                                                                            |
| Title                | "Contact", Newsreader 60px / 500, line height 1.1, -0.01em                                                                                   |
| Intro                | One sentence, Newsreader italic 24px / 1.4, `inkSoft`, 17px below the title; 40px to the first field                                         |
| Label                | Inter 14px / 600, ink, always visible above its field, 8px gap                                                                               |
| Field                | Inter 16px / 1.5, ink on white, 1px `neutral-500` border (5:1), 4px radius, 10px 12px padding, at least 44px tall; message box 176px         |
| Focus                | Border and 2px outline in `link`, 1px offset                                                                                                 |
| Field spacing        | 24px between fields                                                                                                                          |
| Error                | `color.error` #b42318 (6.6:1 on white): field border 2px, message Inter 14px / 500 8px below the field, linked with `aria-describedby`       |
| Status line          | One `role="alert"` line above the button: "Please fix the N highlighted fields." or the send error (429 included); 1px error border, #fef3f2 |
| Button               | "Send message", Inter 16px / 600, white on `link`, `primary-800` on hover, 4px radius, 44px tall, 20px side padding; "Sending…" while busy   |
| Success              | Replaces the form: Newsreader 32px / 500 heading (focused), Newsreader 19px / 1.6 line in #2b3138, Home and bears links as 404 links         |
| At 390px (not drawn) | Title 40px, intro 20px, success heading 26px                                                                                                 |

## 404 (not drawn)

| Element              | Value                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Title                | "Page not found", Newsreader 60px / 500, line height 1.1, -0.01em                                                        |
| Sentence             | "That URL does not match a page on this site." Newsreader italic 24px / 1.4, `inkSoft`, 17px below the title             |
| Links                | Home, Posts, Resume: Inter 16px / 500, `link`, 1px underline 3px below the baseline, 44px targets, 24px apart; 28px down |
| Bears line           | "Lost in the woods? Don’t feed the bears while you find your way." Newsreader 19px / 1.6, `inkSoft`; 28px down           |
| At 390px (not drawn) | Title 40px, sentence 20px, bears line 17px                                                                               |

The CloudFront fallback page has the same markup and inlines the rules of
`index.css`, `public.css` and `NotFound.css` that match it.

## Don’t feed the bears (not drawn)

The games and their cards keep their own art. The page heading follows Posts:
kicker Inter 13px / 600, tracked 0.12em, `link`; title Newsreader 60px / 500;
lede Newsreader italic 24px / 1.4, `inkSoft`; 48px to the cards. Card titles
are Newsreader 28px / 500. The notes below the cards are Newsreader 19px / 1.6
in #2b3138, and the tips heading Newsreader 32px / 500. On the game pages, the
back link is Inter 14px / 500 in `link`, underlined, and the title Newsreader
40px / 500 (32px at 390px). At 390px the landing title is 40px and the lede
20px.

## Colours

| Token           | Value   | Use                                                                |
| --------------- | ------- | ------------------------------------------------------------------ |
| `color.ink`     | #16191d | Name, titles, headings, current nav link, section labels and rules |
| `color.inkSoft` | #4a515a | Excerpts, subtitles, project descriptions (measured)               |
| `color.link`    | #235a58 | Links and accents (`primary-700`)                                  |
| `color.error`   | #b42318 | Form errors (not drawn)                                            |
| `neutral-700`   | #384259 | Nav links (measured)                                               |
| `neutral-600`   | #4d5871 | Dates, meta, footer (measured)                                     |
| —               | #2b3138 | Home About lede and Resume summary prose (measured, not a token)   |
| —               | #22272d | Post body prose (measured, not a token)                            |
| `primary-600`   | #2d7471 | Live status dot (measured); label text in `link`                   |
| —               | #c28d24 | Building status dot (measured); label text #7a5a12                 |

`color.inkSoft` is #4a515a because that is what the artboards use for
secondary text; #2b3138 is the prose colour.

## Fonts

Both families are self-hosted from `apps/web/public/fonts/` under the SIL Open
Font License (licences alongside the files).

| File                      | Source                                                                                                                                                                                    | Axes kept                 | Size  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----- |
| `newsreader-roman.woff2`  | Newsreader 1.003, [`google/fonts` `ofl/newsreader/Newsreader[opsz,wght].ttf`](https://github.com/google/fonts/tree/991ce1de6075188e6b8977a5aa9fcd3610a4e946/ofl/newsreader) at `991ce1de` | opsz 6–72, wght 400–500   | 87 KB |
| `newsreader-italic.woff2` | Same commit, `Newsreader-Italic[opsz,wght].ttf`                                                                                                                                           | opsz 6–72, wght 400–500   | 97 KB |
| `inter-latin.woff2`       | Inter 4.1, [`rsms/inter` release v4.1](https://github.com/rsms/inter/releases/tag/v4.1) (`Inter-4.1.zip`, `InterVariable.ttf`)                                                            | wght 400–700 (opsz at 14) | 34 KB |

All three are subset to the Latin range below with fontTools 4 (`fonttools`
plus `brotli`):

```sh
LATIN="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
fonttools varLib.instancer 'Newsreader[opsz,wght].ttf' wght=400:500 -o nr-roman.ttf
fonttools varLib.instancer 'Newsreader-Italic[opsz,wght].ttf' wght=400:500 -o nr-italic.ttf
fonttools varLib.instancer InterVariable.ttf wght=400:700 opsz=14 -o inter.ttf
for f in nr-roman nr-italic inter; do
  pyftsubset "$f.ttf" --unicodes="$LATIN" --layout-features+=tnum,case --flavor=woff2 --output-file="$f.woff2"
done
```

The fallback `@font-face` rules in `apps/web/src/public.css` (Georgia for
Newsreader, Arial for Inter) use `size-adjust` and ascent/descent overrides
computed from these files, so the swap barely moves text.
