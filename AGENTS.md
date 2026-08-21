# AGENTS.md

Working instructions for Codex and subagents in this repo.

**Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) before any non-trivial change.** It holds the decision log (D1–D12). This file is *how to work here*; that file is *what we're building and why*.

---

## The project

Personal portfolio + blog for Muhammadjon Ibrohimov. Live at **muhammadjon.me** (GitHub Pages, custom domain via `CNAME`). Trilingual: Uzbek, English, Russian. Publishing runs through a Telegram bot.

**The repo is in transition.** v1 (hand-written HTML at the root) is live and must keep working. v2 (Astro + Cloudflare Worker) is designed but not built. Both will coexist during migration — do not assume a file is dead because v2 supersedes it.

---

## Hard rules

Violating any of these is a bug, regardless of whether anything breaks visibly.

1. **No secret ever reaches the browser.** No API token, bot token, or key in HTML, JS, `localStorage`, or committed files. If a feature seems to need one client-side, it belongs in the Worker. This is the single failure that defines v1 — do not recreate it.

2. **Nothing may introduce a recurring cost (D10).** Free tiers only. If a service has no free tier, it does not go in. Say so plainly instead of building it and mentioning the bill later.

3. **The AI agent never publishes (D6).** It writes to the drafts table and stops. There must be no code path from agent output to GitHub or any social platform without an authenticated human action in between. Prompting is not a security boundary; the absent endpoint is.

4. **The primary LLM must be multimodal (D11), with a fallback (D12).** Text-only providers cannot be primary. Providers are **OpenRouter and Groq only** (D13) — not Gemini (author preference), not Codex (no free tier). Provider selection lives behind the single interface in `worker/src/agent.ts`; never call a provider SDK directly from feature code, and never hardcode a model ID — the free roster rotates.

5. **Voice never bypasses the approval gate (D14).** A spoken command is still a proposal. Transcribe, show the text, confirm — then act. Never publish an unreviewed transcript, and never archive raw voice notes beyond a draft's life.

6. **Never commit anything into `posts/`, `posts-data/`, or `posts.json` by hand.** These are machine-generated. Editing them manually desynchronises the index from the post files.

7. **X / Twitter is out of scope (D7).** No account, no free tier. Do not add it, stub it, or reference it in UI.

8. **Never sanitise-by-escaping and call it done.** Post content flows through a Markdown renderer into HTML. Any new render path needs real sanitisation, and URLs interpolated into attributes must be escaped — v1 does neither.

---

## Current state

**Live and working — do not break:**
- `index.html`, `projects.html`, `contact.html` — public pages
- `login.html` → `admin.html` → `post-builder.html` — the only working publishing path today
- `posts/`, `posts-data/`, `posts.json` — generated content

**Known problems, documented in `ARCHITECTURE.md` §2:**
- Tokens live in `localStorage` (the reason v2 exists)
- Telegram signature verification is skipped when no token is stored (`login.html`)
- Client-side auth gate is bypassable (`admin.html`) — low severity: forging a session grants nothing without the author's own token
- Design tokens duplicated across 7 files; theme toggle across 6
- No Open Graph, sitemap, robots, 404, or RSS

**Deleted, do not restore:** `reader-login.html` (dead placeholder Worker URL; D1 makes posts public).

---

## Conventions

**Language.** UI text is Uzbek in v1. In v2 all display strings live in `src/i18n/{uz,en,ru}.json` — never hardcode user-facing text. Code identifiers, comments, and commit messages are English.

**Existing code style.** v1 is single-file HTML with inline `<style>` and `<script>`, 2-space indent, compact one-line CSS rules. Match it when touching v1 files. Do not introduce a build step, framework, or dependency into v1 — that is what v2 is for.

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

No build step in v1. Preview locally:

```bash
python3 -m http.server 8000    # then open http://localhost:8000
```

Deployment is automatic: pushing to `main` publishes to GitHub Pages.

v2 will add `npm run dev` (Astro) and `npx wrangler dev` (Worker). Neither exists yet.

---

## Phase discipline

`ARCHITECTURE.md` §9 defines Phases 0–5, ordered so publishing never breaks. Respect the order. In particular: **do not delete `login.html`, `admin.html`, or `post-builder.html` until the Worker and Mini App actually work** — they are currently the only way the author can publish anything.
