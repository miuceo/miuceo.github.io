# Rebuild brief: muhammadjon.me in the Kobalt brand

For any coding agent. Read `AGENTS.md` first, then `.agents/skills/brand-unbound/DESIGN.md`. Do the work on a branch called `kobalt-redesign`. Pushing to `main` publishes the live site.

## 1. Goal

Replace the current newspaper identity ("The Muhammadjon Journal": red accent, Playfair serif, three-column front page, double rules, dateline, drop cap) with the personal **Kobalt** brand: calm, flat, spacious, cobalt blue lead with coral and green support, Poppins headings, Lora body, light and dark modes. Same site, same URLs, same content, same three languages. Only the look, layout and a few listed fixes change.

## 2. What the site is (verified in the repo)

- Astro 5, static output, `trailingSlash: 'always'`. 54 pages build today. Command: `npm run build`.
- Routes in `src/pages/[lang]/` for `uz`, `en`, `ru`: `index`, `about`, `contact`, `projects`, `posts/index`, `posts/[slug]`, `artifacts/index`, `artifacts/[slug]`, `rss.xml.ts`. Also `src/pages/index.astro` (client-side language redirect), `404.astro`, `post-builder.astro` (author tool, `noindex`).
- Shared: `src/layouts/BaseLayout.astro` (head, SEO, theme script, global `.wrap`, `.page-header`, `.section-label`, `.empty-state`), `src/components/{Nav,Footer,PostCard,ProjectCard,ArtifactCard}.astro`, `src/styles/tokens.css`, `src/i18n/*.json`, `src/lib/*`.
- `src/lib/rehype-journal.mjs` turns a Markdown paragraph with one image into `<figure class="post-figure">` and with several images into a scroll-snap `.gallery`. Keep the generated markup and class names; restyle them.
- Content: `src/content/{posts,projects,artifacts}`. Schemas in `src/content/config.ts` (do not change).
- Read each file fully before editing it. I did not read `PostCard`, `ProjectCard`, `ArtifactCard`, the artifacts pages, `contact`, `projects`, `posts/index` or `src/islands/PostBuilder/styles.css` in detail.

## 3. Open decisions (use these defaults; the owner may override)

| # | Decision | Default |
|---|---|---|
| D-a | Site name shown in header, titles, social previews, RSS | **Muhammadjon Ibrohimov** until the owner chooses. Put it in ONE place (`strings.masthead.name` in each i18n file plus one constant in `src/lib/site.ts`) |
| D-b | Date line in the header | Remove it (and its script in `Nav.astro`). It is a newspaper device |
| D-c | The two neon nav buttons (Artifacts orange, Neuron UZ blue) | Remove neon, glow and pulse. Artifacts becomes a normal link with a green "New" pill. Neuron UZ becomes a coral secondary pill. Keep its `href="/neuron-uz/"` unchanged (it is not in this repo) |
| D-d | Secondary (gray) text | Kobalt has no readable gray for light mode (`mid` is 2.0:1). Do not invent one. Build hierarchy with size, weight and font. Use `accent-1-text` for small labels |
| D-e | Russian heading font | Poppins has no Cyrillic. Use the stack `"Poppins", "Montserrat", Arial, sans-serif`. The browser falls back per character, so Cyrillic uses Montserrat 600. Load `family=Montserrat:wght@600;700` |
| D-f | Delete dead root files | Only after verification (section 7). Do it in a separate commit |

## 4. Token mapping (old name → Kobalt)

Replace `src/styles/tokens.css` with the contents of `.agents/skills/brand-unbound/tokens.css`, plus Montserrat in the font import and the stack from D-e. Keep a temporary alias block so pages keep working while you migrate, then delete it:

```
--ink → --text          --bg-2, --bg-3 → --surface
--line, --rule → --mid  --line-soft → --surface
--accent → --accent-1 (fills) / --accent-1-text (text and links)
--font-display, --font-serif, --font-sans → --font-heading
--font-body → --font-body (Lora)
--ink-soft → no equivalent; replace each use per D-d
--neuron, --artifacts, --danger → remove (admin-only danger: coral fill with dark text)
```

The inline script in `BaseLayout.astro` always sets `data-theme="light|dark"` before paint, so the `:root[data-theme="dark"]` block of Kobalt drives dark mode. Keep that script and the `miuceo_theme` key.

## 5. Layout, page by page (flat, left-aligned, 8px spacing scale)

- **Header (`Nav.astro`).** One sticky bar. Site name left (Poppins 600), section links, language switch (UZ/EN/RU), theme toggle, admin icon. Bottom border 1px `mid`. No masthead block, no double rules. Phones: keep the horizontally scrollable link strip.
- **Front page (`[lang]/index.astro`).** Left-aligned hero: eyebrow (Poppins 12px uppercase, `accent-1-text`), H1 48px/28px phones, Lora lead 18px, buttons (primary cobalt "Projects", ghost "Contact", ghost "Telegram"). Decorative flat brand shapes (circle, rounded square, half circle in cobalt, coral, green, surface) on the right, hidden on phones. Below: "Latest", a card grid of posts and artifacts, newest first, still ordered purely by date (no featured flag). The first card spans two columns. A pill tag shows the kind (Post cobalt, Artifact green). Below that: "Projects" on a `surface` section, three cards. Keep the existing data logic and JSON-LD.
- **Cards** (`PostCard`, `ProjectCard`, `ArtifactCard`). Radius 12, 1px `mid` border, no shadow, 24px padding. Hover: border becomes `accent-1`; no movement, no scale.
- **Inner page header (`.page-header`).** Left-aligned H1 and Lora lead, no rules, no centering.
- **Post page (`posts/[slug].astro`).** Column about 680px (about 65 characters of Lora 18px). H1 Poppins 600 40px (30px phones). Dek in Lora 20px. Byline in Poppins 13px 500. Remove the drop cap and the red heading rules. Blockquote: 4px `accent-1` left border, Lora italic 22px. Figures and images: radius 12, flat. The wide lead-figure breakout, side figures and gallery behaviour stay; restyle gallery buttons as Kobalt ghost buttons. Links: `accent-1-text`, underlined.
- **About, Contact, Projects, Artifacts pages.** Same system: cards, pills for tags (radius 999, accent fill, correct text color), timeline as a simple vertical list with a cobalt dot.
- **Footer.** Inverse `band` background with `band-text` text; name, copyright, RSS, Telegram, GitHub.
- **404 and root redirect.** Restyle `404.astro`. Do not change redirect logic except the `localStorage` fix below.
- **Post-builder page.** It inherits tokens. It must still load, authenticate and publish after your changes. Do not restyle it in this phase; only fix anything the token change visibly breaks.

## 6. Work order (stop and run `npm run build` after each step)

1. Create branch. Replace tokens (section 4). Build. Everything should still render, with the new colors and fonts.
2. `BaseLayout.astro`: global styles, single site-name constant in title, `og:site_name` and RSS title (18 hardcoded "The Muhammadjon Journal" strings across `src/`; find them with `grep -rn "Muhammadjon Journal" src`).
3. `Nav.astro` and `Footer.astro` (D-b, D-c).
4. Front page and the three card components.
5. Post page and `rehype-journal` figure and gallery styling.
6. Remaining pages and 404.
7. Remove the alias block. Confirm no hex outside `tokens.css`: `grep -rnE "#[0-9A-Fa-f]{6}" src | grep -v tokens.css` must be empty (after the neon removal, `Nav.astro` is the only current offender).
8. Fixes in section 7. Final checks in section 8.

## 7. Fix in passing

- **`localStorage` without try/catch** in `BaseLayout.astro` (the `miuceo_lang` write), `src/pages/index.astro` and `src/pages/404.astro`. Wrap every call. If storage throws, the redirect must still go to `/uz/` or the browser's language.
- **Unused i18n keys.** `nav.brand`, `home.latestPost`, `home.latestPosts`, `home.recentPosts`, `home.continueReading`, `home.readPost`, `home.noPostsShort`, `home.noOtherPosts`, `home.viewAllArtifacts`, `home.viewAllPosts` had zero `.key` references when checked. Re-search with grep (including bracket access) before deleting, and delete from all three files together.
- **`home.noPosts`** tells the public to "create your first one through the admin panel". Replace it with a neutral message in all three languages (English: "No posts yet."). Mark the Uzbek and Russian wording for native review.
- **Dead root files** (candidates): `index.html`, `projects.html`, `contact.html`, `404.html`, `assets/theme.css`, `assets/theme.js`, root `robots.txt`, `sitemap.xml`, `favicon.svg`. Before deleting each, grep for references, and confirm `public/` has its served counterpart. Never touch `posts/`, `posts-data/`, `posts.json`, `public/login.html`, `public/admin.html`. Do this in its own commit.

## 8. Acceptance checklist (report each item as pass or fail with evidence)

1. `npm run build` passes with no errors; page count is 54 or explained.
2. The empty-diff command in `AGENTS.md` prints nothing.
3. Open `npm run preview`. Check `/uz/`, `/en/`, `/ru/` (front, a post, projects, about, contact, artifacts, 404) at 375px, 768px and 1280px, in light and dark. Describe what you saw.
4. Russian headings render in Montserrat (not Arial). Uzbek `oʻ gʻ` render correctly in headings and body.
5. No hex outside `tokens.css`; no `box-shadow`, `gradient`, `text-shadow` or `animation` except the reduced-motion-safe theme fade; at most three accent colors on any page.
6. Contrast: body text, links (`accent-1-text`), buttons (`on-accent-*` on fills) all at least 4.5:1 in both themes.
7. Keyboard: every link and button shows a `:focus-visible` ring. Theme toggle works and persists. Language switch works.
8. With JavaScript disabled, all content is readable.
9. `/post-builder/` still loads and redirects to `login.html` when there is no session.
10. Social tags, canonical, hreflang, sitemap and RSS still build, with the site name from the single constant.

## 9. Report format when finished

Two or three sentences on the result, then the checklist table, then anything you could not verify. Do not paste file contents. List the files changed.

---

# Part B: Uzbek new-alphabet converter (separate from the Kobalt redesign)

Do Part B on its own branch (`uz-new-alphabet`) or after Part A is merged. It does not depend on the design work. The code is already written and tested in this pack; your job is to install it, wire it in and verify it on the real site.

## B1. Background (verified from three news sources, Oct 2026)

The law was signed 21 October 2026 and takes effect **22 April 2027**. Four digraph letters become single letters: **Sh→Ş, Ch→Ç, Oʻ→Ö, Gʻ→Ğ**. "ng" is no longer a separate letter but is still spelled the same (tong, ming). The tutuq sign stays (ma'no, she'r → şe'r). Poppins and Lora both contain Ş ş Ç ç Ö ö Ğ ğ (checked in the font files), so no font change is needed for these letters.

## B2. Design (already decided)

Source content keeps today's spelling. A build-time step rewrites only the finished Uzbek pages. Reasons: it is reversible, safe before the effective date, and does not disturb the editor, the Worker's translation prompts or `posts-data/` (which must never be hand-edited). The converter only touches visible text, `alt`/`title`/`aria-label`/`placeholder`, `meta` description and Open Graph tags, JSON-LD `headline`/`description`, and the `<title>`/`<description>` of the RSS feeds. It skips code, `pre`, scripts, styles, URLs and all attribute values such as `href`, `class`, `id`.

## B3. Install

1. Copy from this pack into the repo, same paths: `src/lib/uz-alphabet.mjs`, `src/lib/uz-alphabet.d.mts`, `src/lib/uz-alphabet-integration.mjs`, `src/lib/uz-alphabet.config.json`, `scripts/uz-alphabet.test.mjs`, `scripts/uz-alphabet-integration.test.mjs`, `scripts/convert-uz.mjs`.
2. In `package.json` add `"unified"` and `"rehype-parse"` to `devDependencies`, using the versions already in `package-lock.json` (they come with Astro; check with `npm ls unified rehype-parse`). Run `npm install`.
3. In `astro.config.mjs` add `import uzAlphabet from './src/lib/uz-alphabet-integration.mjs';` and put `uzAlphabet()` first in the `integrations` array. Change nothing else in that file.
4. Add the scripts `"test:uz": "node --test scripts/uz-alphabet.test.mjs scripts/uz-alphabet-integration.test.mjs"` and `"report:uz": "node scripts/convert-uz.mjs --built dist"` to `package.json`.

## B4. Verify (all must pass; report evidence)

1. `npm run test:uz`: 27 tests pass.
2. `UZ_NEW_ALPHABET=0 npm run build`, save `dist` as `dist-off`. `UZ_NEW_ALPHABET=1 npm run build`, save as `dist-on`. Then `diff -rq dist-off dist-on` must list **only** files under `uz/` and `rss.xml`. If `en/` or `ru/` show up, first check whether the cause is `src/lib/github.ts` (the build asks the GitHub API for star counts, so project pages can differ between any two builds, with the switch on or off). Temporarily make `getStars` return `null` for a clean comparison, then restore it.
3. A default build today (no variable) must be byte-identical to a build before you added the integration. Today is before the switch date, so nothing may change on the live site.
4. `node scripts/convert-uz.mjs --built dist-off` (build with `UZ_NEW_ALPHABET=0` first). Read the whole list (about 430 words). Add any English word or name to `protectedWords` (known so far: machine, learning, pytorch, bench, benchmark, teacher, internship, research, show, cache, changes, changing, christopher, chroma, langchain, churn, chatgpt, chrome, speech). Rebuild and re-read until no English word remains.
5. In `dist-on`, open `/uz/`, a post, `/uz/projects/` and `/uz/about/`: check a title, a card, a code block (must be unchanged), a link href (must be unchanged), `<title>`, `og:description`, and `/rss.xml` (`xmllint --noout`).
6. Run `grep -rn "Dushanba\|Chorshanba\|Payshanba\|Shanba" src`. The weekday names in `Nav.astro` live in a client script and are NOT converted; Part A removes that date line. If it is still there, change those four names by hand to Duşanba, Çorşanba, Payşanba, Şanba.

## B5. Things you must not do

Do not convert source files "to be helpful". Do not change the Worker, the editor, translation prompts or dictation settings; if the owner wants the Worker to produce the new alphabet, that is a separate decision after 22 April 2027. Do not guess exceptions: words where s+h or c+h are two separate sounds (compounds) need a trusted dictionary or the owner's review, so list any suspicious word you notice in your report instead of fixing it.

## B6. Known limits (tell the owner)

- Accuracy depends on the exception list, which starts empty. A published research evaluation of a similar tool reached about 0.9 word-level accuracy with 233 hand-listed exceptions; expect a few wrong words until a native speaker reviews the list.
- HTML artifacts under `public/artifacts/files/` (shown in sandboxed iframes) are not converted.
- Uzbek text typed in the admin and editor pages stays in today's spelling.
- The site only changes on 22 April 2027 if a deploy happens that day (push, or run the workflow by hand).
