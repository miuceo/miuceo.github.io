# AGENTS.md

Standing rules for any coding agent (Antigravity, Codex, DeepSeek, others) working in this repo. Keep this file under 12,000 characters.

Read `docs/REBUILD-BRIEF.md` for the current task. Read `ARCHITECTURE.md` (decision log D1–D19; §12 and §13 are the newest) before any change to the Worker, the editor or publishing. For anything visual, the design system is `.agents/skills/brand-unbound/DESIGN.md` plus `tokens.css`.

## The project

Personal portfolio and blog for Muhammadjon Ibrohimov, live at muhammadjon.me (GitHub Pages, custom domain). Three languages: Uzbek (default), English, Russian. Astro 5, static output. A Cloudflare Worker in `worker/` holds every secret. Content is Markdown and JSON in git.

**Pushing to `main` deploys to production immediately** (`.github/workflows/deploy.yml`). Work on a branch (`kobalt-redesign`). Never push to `main` unless the owner says so. Commit only when asked. Commit messages: present tense, describe the change ("Add Kobalt tokens"), English.

## Hard rules (a violation is a bug even if nothing visibly breaks)

1. **No secret in the browser.** No token or key in HTML, JS, `localStorage` or committed files. Secrets belong in the Worker.
2. **No recurring cost (D10).** Free tiers only. If a service has no free tier, it does not go in; say so plainly.
3. **The LLM never publishes (D6).** Model output returns as text. No code path from model output to GitHub or Telegram without an authenticated human click. The missing endpoint is the safeguard, not a prompt.
4. **Providers (D13, D19).** Text models: OpenRouter and Groq only, behind the one interface in `worker/src/agent.ts`. Speech-to-text tries Gemini first, then Groq Whisper. Never call a provider SDK from feature code. Never hardcode a model ID.
5. **Voice never acts on its own (D14, D17).** Dictation lands in an editor text block that the author reads first. Never store raw audio.
6. **Never hand-edit `posts/`, `posts-data/` or `posts.json`.** Machine-generated.
7. **X / Twitter is out of scope (D7).** Do not add, stub or mention it in UI.
8. **Sanitise for real.** Post Markdown passes `rehype-sanitize` before layout. Any new render path needs real sanitisation. Escaping alone is not enough.

## Do not touch during a visual redesign

- `worker/` (all of it), `src/islands/PostBuilder/editor.ts`, `public/login.html`, `public/admin.html`: these are the only publishing path. `/post-builder/` may inherit new tokens, but it must still load, authenticate and publish. Restyling the admin surfaces is a later phase.
- `src/content/` schemas (`src/content/config.ts`) and existing content files.
- `.github/workflows/deploy.yml`, `CNAME`, `public/CNAME`.
- `rehype-sanitize` order in `astro.config.mjs`.

Run this before finishing; its output must be empty:
`git diff --stat main -- worker public/login.html public/admin.html posts posts-data posts.json src/content src/islands/PostBuilder/editor.ts .github`

## Uzbek alphabet (new Latin letters, law in force 2027-04-22)

Sh→Ş, Ch→Ç, Oʻ→Ö, Gʻ→Ğ. "ng" and the tutuq sign (ma'no, she'r) do not change. The site converts at **build time**: `src/lib/uz-alphabet-integration.mjs` rewrites only `dist/uz/**` and the two Uzbek RSS feeds after the build.

- **Source files never change.** Do not convert `uz.json`, `uz.md`, content frontmatter, `posts-data/`, the Worker prompts, or the editor. They keep today's spelling; the Worker's AI prompts and dictation hints depend on it.
- **The converter must only ever see Uzbek.** Never run it on `en`, `ru`, code, URLs, ids, classes or slugs. The tests in `scripts/` guard this; keep them passing.
- Switch: `UZ_NEW_ALPHABET=1` forces on, `0` forces off, unset means on from 2027-04-22 (needs a deploy that day; the workflow has `workflow_dispatch`).
- False positives (English words, names) go in `src/lib/uz-alphabet.config.json` `protectedWords`. Uzbek words with a special spelling go in `exceptions`, only from a trusted dictionary or the owner. Never guess.
- After any change to page text, run `npm run build` then `node scripts/convert-uz.mjs --built dist` and read the whole list.
- Client-side scripts that contain Uzbek strings are not converted. Check for them with `grep -rn "Shanba\|Chorshanba" src`.

## Conventions

- **Language.** All visible site text lives in `src/i18n/{uz,en,ru}.json`. Never hardcode display text in components. Every key must exist in all three files. A missing translation must never render as a raw key.
- **Cyrillic is mandatory.** Every font used on public pages must cover Cyrillic, because `/ru/` renders in the same type. Poppins does not (Latin, Latin-extended and Devanagari only), so Russian headings need the per-character fallback described in the brief. Also check Uzbek `oʻ` and `gʻ` render in every font.
- **Code style.** TypeScript and Astro, 2-space indent. Scoped `<style>` inside components, shared tokens in `src/styles/tokens.css` only.
- **Motion.** Respect `prefers-reduced-motion`. Motion never gates content. Everything readable with JS off.
- **Accessibility.** Body text at least 4.5:1 contrast. Visible `:focus-visible` ring. Real `alt` text on content images. Tap targets at least 40px.
- **Theme.** `BaseLayout.astro` sets `data-theme="light|dark"` on `<html>` before paint and stores the choice in `localStorage` key `miuceo_theme`. Wrap every `localStorage` call in try/catch.

## Design rules (Kobalt)

- Colors only from the token list. At most three accents: cobalt `accent-1`, coral `accent-2`, green `accent-3`. Cycle them in that order. Ratio about 60% neutral, 30% cobalt, 10% coral or green.
- Flat. No gradients, no drop shadows, no glow, no neon, no pulsing animation.
- Heading font Poppins 600 (with the Cyrillic fallback), body Lora 400, UI and labels Poppins 500–600.
- Text on a fill follows the contrast table in `DESIGN.md`. Never use raw coral as text on a light background (2.8:1, fails). Never use `mid` as text on a light background (2.0:1); it is for borders and decoration.
- No hex values outside `src/styles/tokens.css`.
- Both light and dark are first-class. Dark is not an inversion; use the dark column of tokens.

## Commands

```bash
npm ci
npm run dev        # dev server, HTTPS with a self-signed certificate
npm run build      # the real check; must pass with zero errors
npm run preview    # serve dist/ to look at it
cd worker && npx tsc --noEmit   # only if worker/ was touched (it should not be)
```

## Working with the owner

Explain design tradeoffs in plain language, not jargon; he is comfortable with implementation detail once a direction is agreed. When he is offered options he tends to say "all of the above", so push back with one concrete recommendation. Cost is a hard constraint. Verify current pricing and API terms with a search rather than from memory.
