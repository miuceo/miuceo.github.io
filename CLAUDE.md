# CLAUDE.md

Working instructions for Claude and subagents in this repo.

**Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) before any non-trivial change.** It holds the decision log (D1–D17); §12 is the most recent word wherever it contradicts an earlier section. This file is *how to work here*; that file is *what we're building and why*.

---

## The project

Personal portfolio + blog for Muhammadjon Ibrohimov. Live at **muhammadjon.me** (GitHub Pages, custom domain via `CNAME`). Trilingual: Uzbek, English, Russian. The author writes Uzbek; English and Russian are generated at publish time and reviewed before they go out.

**The migration is done.** v2 (Astro + Cloudflare Worker) is live and is the site. What survives from v1 is a small, deliberate set: `public/login.html` and `public/admin.html` (still load-bearing), and `posts/*.html` (permalinks for posts published before the cutover). Everything else at the repo root is dead weight — check before assuming a root file is served.

---

## Hard rules

Violating any of these is a bug, regardless of whether anything breaks visibly.

1. **No secret ever reaches the browser.** No API token, bot token, or key in HTML, JS, `localStorage`, or committed files. If a feature seems to need one client-side, it belongs in the Worker. This is the single failure that defines v1 — do not recreate it.

2. **Nothing may introduce a recurring cost (D10).** Free tiers only. If a service has no free tier, it does not go in. Say so plainly instead of building it and mentioning the bill later.

3. **The LLM never publishes (D6).** It returns text and stops. There must be no code path from model output to GitHub or any social platform without an authenticated human action in between. Prompting is not a security boundary; the absent endpoint is. There is no agent any more (D15) — `agent.ts` holds three fixed tasks (translate, transcribe, summarise), each with one caller and no ability to act.

4. **The primary LLM must be multimodal (D11), with a fallback (D12).** Text-only providers cannot be primary. Providers are **OpenRouter and Groq only** (D13) — not Gemini (author preference), not Claude (no free tier). Provider selection lives behind the single interface in `worker/src/agent.ts`; never call a provider SDK directly from feature code, and never hardcode a model ID — the free roster rotates.

5. **Voice never bypasses the approval gate (D14, D17).** Dictation goes into a text block in the editor, where the author reads and edits it before publishing — nothing acts on a transcript. If you ever add a path where speech *causes* something, the old rule returns in full: transcribe, show the text, confirm, then act. Never archive raw voice notes; the audio lives only inside the request that transcribes it.

6. **Never commit anything into `posts/`, `posts-data/`, or `posts.json` by hand.** These are machine-generated. Editing them manually desynchronises the index from the post files.

7. **X / Twitter is out of scope (D7).** No account, no free tier. Do not add it, stub it, or reference it in UI.

8. **Never sanitise-by-escaping and call it done.** Post content flows through a Markdown renderer into HTML. Any new render path needs real sanitisation, and URLs interpolated into attributes must be escaped — v1 does neither.

---

## Current state

Phases 0–4 are live. Phase 5 was built and then partly removed — **read `ARCHITECTURE.md` §12 before touching the Worker or the editor.**

**Live and working — do not break:**
- The Astro site: `src/pages/`, served at `muhammadjon.me`. Posts live at `/[lang]/posts/[slug]/`.
- `public/login.html` → `public/admin.html` → `/post-builder/` — the publishing path. `login.html` issues the session; `/post-builder/` redirects there when there isn't one.
- `worker/` — every route behind `requireSession`; there is no unauthenticated route.
- `posts-data/`, `posts.json` — the editor's own store (block source + index), machine-generated.
- `posts/*.html` — v1 permalinks for already-published posts. Not generated any more; deletable, not writable.

**How a post is published now:** the author writes Uzbek in `/post-builder/` (typing or dictating), clicks *Generate & Publish*, the Worker translates it to en/ru and writes two summaries, the author reads all of it in the review panel, and their click writes `src/content/posts/<slug>/{uz,en,ru}.md` plus the channel message.

**Deleted, do not restore:** `post-builder.html` (v1 editor — single-language, dead permalinks), `worker/src/bot.ts` and `history.ts` (the Telegram capture bot, D15), `reader-login.html` (D1 makes posts public), the root duplicates of `login.html`/`admin.html`.

**Known problems still open:**
- Design tokens duplicated across files; theme toggle duplicated too.
- Root `index.html`, `projects.html`, `contact.html`, `404.html` are dead v1 files that nothing serves.
- The en/ru project descriptions were written by Claude and deserve a native-speaker review.

---

## Conventions

**Language.** Site display strings live in `src/i18n/{uz,en,ru}.json` — never hardcode user-facing text there. The editor and admin pages are Uzbek-only and hardcode their strings; they are author-facing tools, not site chrome. Code identifiers, comments, and commit messages are English.

**Code style.** `src/` is TypeScript and Astro, 2-space indent. The two surviving v1 pages (`public/login.html`, `public/admin.html`) are single-file HTML with inline `<style>` and `<script>` and compact one-line CSS rules — match that when touching them, and do not give them a build step.

**Commits.** Present tense, describe the change: `Add Open Graph tags to post template`. Not `changed whole project` or `added streamlit app` (see history for what to avoid). Commit or push only when asked.

**Content model.** One canonical slug per post, translated titles. Slugs must survive non-ASCII titles — v1's `slugify()` collapses Cyrillic to `post-<timestamp>`; do not copy that logic forward.

---

## Working with the author

Muhammadjon is an AI/ML engineer, but **has asked to be treated as non-technical in design discussions** — explain tradeoffs in plain language, not jargon. He is comfortable with implementation detail once a direction is agreed.

- He will pick "all of the above" when offered options. Push back with a concrete synthesis rather than silently choosing one — see `ARCHITECTURE.md` §7 for how the four conflicting UI directions were zoned.
- Cost is a hard constraint, not a preference. Verify a service is free *before* designing it in.
- Verify current pricing and API terms with a web search rather than from memory — several tiers changed in early 2026.

---

## Commands

```bash
npm run dev                       # Astro dev server
npm run build                     # full build — this is the real check
cd worker && npx tsc --noEmit     # Worker typecheck
cd worker && npx wrangler dev     # Worker locally
```

Deployment is automatic: pushing to `main` builds the Astro site and publishes it to GitHub Pages. The Worker deploys separately with `npx wrangler deploy`.

---

## Phase discipline

`ARCHITECTURE.md` §9 defines Phases 0–5, ordered so publishing never breaks; §12 records what was removed from Phase 5 and why. Respect both.

The rule that mattered here — never remove the only working publishing path — was satisfied before `post-builder.html` was deleted: `/post-builder/` had been live since Phase 4. **`public/login.html` and `public/admin.html` are still load-bearing** and must not be deleted; `/post-builder/` redirects to `login.html` when there is no session.
