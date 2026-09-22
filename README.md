# muhammadjon.me

Personal portfolio + blog for Muhammadjon Ibrohimov. Live at **[muhammadjon.me](https://muhammadjon.me)** (GitHub Pages, custom domain via `CNAME`). Trilingual: Uzbek, English, Russian.

This file is a short orientation. For the full design rationale and decision log, see **[ARCHITECTURE.md](./ARCHITECTURE.md)**; for day-to-day working conventions, see **[CLAUDE.md](./CLAUDE.md)**.

## Stack

- **Site**: [Astro](https://astro.build) (static output), served by GitHub Pages.
- **API**: a [Cloudflare Worker](./worker/) — the only place any secret (GitHub token, Telegram bot token, AI provider keys) exists. The browser never holds one.
- **Storage**: content is git — Markdown/JSON files in this repo, committed by the Worker on the author's behalf via the GitHub Contents API.

## Commands

```bash
npm install
npm run dev                       # Astro dev server (HTTPS, self-signed cert)
npm run build                     # full production build — the real check before pushing
cd worker && npm install
cd worker && npx tsc --noEmit     # Worker typecheck
cd worker && npx wrangler dev     # Worker locally
```

## Deployment

Pushing to `main` triggers [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml): it builds the Astro site and publishes it to GitHub Pages. The Worker deploys separately and manually, from `worker/`, with `npx wrangler deploy`.

## How a post gets published

1. The author opens `/post-builder/` (an Astro island; falls back to `public/login.html` → `public/admin.html` → `/post-builder/` if there's no session).
2. They write the post in **Uzbek**, typing or dictating into a text block (dictation goes through Whisper transcription + a punctuation pass — see `ARCHITECTURE.md` §5.1).
3. Clicking *Generate & Publish* asks the Worker to translate the post into English and Russian and write two summaries (a Telegram caption and a meta description). Every generated string is shown in a review panel before anything is written anywhere — the model never publishes on its own (`ARCHITECTURE.md` D6).
4. On approval, the author's own browser session writes `src/content/posts/<slug>/{uz,en,ru}.md` via the Worker's `/api/github/put`, and the Worker posts the announcement to the Telegram channel.
5. The push to `main` (from that commit) rebuilds and redeploys the site.

Posts already published before the Astro migration keep their old `/posts/<slug>.html` permalinks (`posts/*.html` at the repo root); new posts are served at `/[lang]/posts/<slug>/` and are not regenerated in the old shape.

`posts.json` and `posts-data/*.json` are the editor's own working store (block source + an index for the admin post list) — Astro's build never reads them, and they are machine-generated only. **Never hand-edit `posts/`, `posts-data/`, or `posts.json`** — see `CLAUDE.md` rule 6.

## Admin & auth

`public/login.html` and `public/admin.html` are the two surviving v1 pages (single-file HTML, no build step, Uzbek-only). Login is Telegram-based: the Worker verifies Telegram's HMAC signature server-side (`worker/src/auth.ts`) and issues a revocable, D1-backed session. The browser only ever holds a signed session id — never a GitHub or Telegram bot token. Every `/api/*` route on the Worker sits behind that session check; there is no unauthenticated route.

`admin.html` has two tabs: **Postlar** (list/edit/delete posts) and **Artifacts** (see below).

## Artifacts

Self-contained HTML artifacts generated in AI chat tools (Claude, Gemini, ChatGPT, ...) can be uploaded through the **Artifacts** tab in `admin.html` and shown publicly at `/[lang]/artifacts/`.

- **Metadata** lives in `src/content/artifacts/<slug>.json` (an Astro `data` content collection) — title, model, description, tags, prompt, license, etc.
- **The artifact's HTML** is a static file at `public/artifacts/files/<slug>.html`, served as-is.
- The upload endpoint (`worker/src/index.ts`, `/api/artifacts/save`) size-caps the file (2 MB) and scans it for accidentally-embedded API keys/tokens before writing it — a warning the author can override, not a silent block. That file path is deliberately **excluded** from the Worker's generic `isAllowedPath()` allowlist (`worker/src/github.ts`), so it can only be written through that validated route.
- On the public site, every artifact renders inside a **sandboxed `<iframe>`** with `sandbox="allow-scripts allow-popups allow-forms"` and no `allow-same-origin` — it runs on an opaque origin, so it cannot reach this site's cookies, `localStorage`, or admin session, no matter what the artifact's own JavaScript tries to do.

## Repo layout

```
src/
  content/{posts,projects,artifacts}/  # git-versioned content, Zod-validated
  components/, layouts/, i18n/{uz,en,ru}.json
  islands/PostBuilder/                 # the block editor, mounted at /post-builder/
  pages/[lang]/                        # localised routes (uz/en/ru)
worker/
  src/{auth,drafts,publish,agent,github,telegram,index}.ts
public/
  login.html, admin.html               # v1 pages, still load-bearing
  artifacts/files/                     # uploaded artifact HTML, written by the Worker
.github/workflows/deploy.yml           # Astro build → GitHub Pages
ARCHITECTURE.md                        # full design rationale + decision log
CLAUDE.md                              # working conventions for this repo
```
