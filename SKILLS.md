# SKILLS.md

Reusable procedures for subagents working in this repo. Each entry is a recurring task with the steps, the definition of done, and the mistakes that have already been made once.

**Read [`CLAUDE.md`](./CLAUDE.md) first** for the hard rules, and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for decisions D1–D14. Nothing here overrides those.

> **On format:** this file is a registry, not an executable skill. Claude Code loads skills from `.claude/skills/<name>/SKILL.md` with YAML frontmatter. Any entry below can be promoted to a real skill by copying it into that layout — worth doing for the ones that get used weekly. Until then, subagents read this file directly.

---

## Index

| Skill | Use when | Risk |
|---|---|---|
| [`seo-surface`](#seo-surface) | Adding or auditing metadata, feeds, sitemaps | Low |
| [`design-token-change`](#design-token-change) | Any colour, font, spacing, or motion change | Low |
| [`v1-safe-edit`](#v1-safe-edit) | Touching the live hand-written HTML | **High** |
| [`worker-endpoint`](#worker-endpoint) | Adding an API route to the Worker | **High** |
| [`agent-task`](#agent-task) | Adding anything that calls an LLM | **High** |
| [`voice-pipeline`](#voice-pipeline) | Speech-to-text or text-to-speech work | Medium |
| [`platform-connector`](#platform-connector) | Adding a distribution channel | Medium |
| [`i18n-string`](#i18n-string) | Adding user-facing text | Low |
| [`repo-security-pass`](#repo-security-pass) | Before any release, and after touching auth | **High** |

---

## `seo-surface`

**When:** Open Graph, Twitter cards, `sitemap.xml`, `robots.txt`, `404.html`, RSS, JSON-LD, `hreflang`.

**Why it matters here:** v1 has *none* of these. Sharing a post anywhere produces a bare grey link. This is the highest value-per-hour work in the repo.

**Steps**
1. Every page needs `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, plus `twitter:card=summary_large_image`.
2. `og:image` must be an absolute URL on `https://muhammadjon.me`. Relative paths silently fail on every platform.
3. Post pages: add JSON-LD `BlogPosting` with `headline`, `datePublished`, `dateModified`, `author`, `inLanguage`.
4. Trilingual pages need reciprocal `hreflang` for `uz`, `en`, `ru` plus `x-default`. Every language must link to *all* others, itself included.
5. One RSS feed per language. Never mix languages in one feed.

**Done when:** the URL previews correctly when pasted into Telegram, and `sitemap.xml` lists every language variant.

**Gotchas**
- GitHub Pages needs a `.nojekyll` file if any path ever starts with `_`. Not currently needed — check before adding directories.
- Do not add `og:image` pointing at the old `favicon.ico`. It was 892 KB and has been deleted.

---

## `design-token-change`

**When:** any colour, font, spacing, radius, or motion value changes.

**Steps**
1. Change the token in the single source (`src/styles/tokens.css` in v2). Never a component, never inline.
2. Verify **light and dark**. Dark mode is defined by overriding tokens under `[data-theme="dark"]`, not by rewriting rules.
3. Verify contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI borders.
4. If motion changed, re-check under `prefers-reduced-motion: reduce`.

**Gotchas**
- v1 duplicates the same variables across **seven** files and the theme toggle across **six**. Changing one file only is the classic failure here — grep before assuming.
- Respect the zoning in `ARCHITECTURE.md` §7. Liquid-glass effects belong on nav and modals *only*; brutalist treatment belongs on the projects grid *only*. Do not let a zone leak.

---

## `v1-safe-edit`

**When:** editing `index.html`, `projects.html`, `contact.html`, `admin.html`, `post-builder.html`, or anything in `posts/`.

**This is the live site and the only working publishing path.** Breaking `post-builder.html` means the author cannot publish at all.

**Steps**
1. Read the whole file first. These are single-file pages with inline `<style>` and `<script>`; context lives above and below the edit.
2. Match the existing style: 2-space indent, compact one-line CSS rules, no build step, no dependencies.
3. Never introduce a framework, bundler, or npm package into v1. That is what v2 is for.
4. Test locally with `python3 -m http.server 8000` before committing.
5. If the change touches publishing, walk the full flow: settings → load posts → edit → publish → verify the post renders.

**Never**
- Delete `login.html`, `admin.html`, or `post-builder.html` until the Worker and Mini App actually work (`ARCHITECTURE.md` §9).
- Hand-edit `posts.json`, `posts/`, or `posts-data/`. Generated; edits desync the index.

---

## `worker-endpoint`

**When:** adding any route to the Cloudflare Worker.

**Steps**
1. **Authenticate first.** Every route except `/auth` requires a valid session cookie. Verify before doing anything else in the handler.
2. Secrets come from the Worker environment. Never from a request, never a literal, never `wrangler.toml`.
3. CORS: allow exactly the site origin. Never `*` on a route that accepts credentials — the browser will reject it anyway, and a wildcard signals the auth model was misunderstood.
4. Validate and bound every input: length caps, type checks, allow-lists. Assume the client is hostile even though it is the author's own phone.
5. Return structured errors. Never leak a provider response or stack trace to the client.

**Done when:** the endpoint refuses unauthenticated calls, rejects malformed input without a 500, and holds no secret in any response.

**Gotchas**
- Telegram `initData` verification is HMAC-SHA256 keyed by `HMAC("WebAppData", botToken)` — a *different* construction from the Login Widget's. Do not mix them up; both appear in v1's `login.html`.
- Always check `auth_date` age. A valid signature on a year-old payload is still a replay.

---

## `agent-task`

**When:** any feature that calls an LLM.

**The rule that outranks everything: the agent writes drafts, never publishes (D6).**

**Steps**
1. Write the draft to D1 **before** calling any model. A provider failure must degrade to "translation pending", never lost work.
2. Call through the single interface in `worker/src/agent.ts`. Never import a provider SDK into feature code.
3. Pick the route by task, not habit — see the routing table in `ARCHITECTURE.md` §10. Multimodal work goes to OpenRouter; fast text goes to Groq.
4. Model IDs live in Worker config, never in code. **The free roster rotates** — a hardcoded ID is a future outage.
5. Handle rate limits as a normal path, not an exception: fall back down the ladder, then queue and retry.
6. Surface output to the human for approval. Always.

**Never**
- Add Gemini or Claude (D13). Not as a fallback, not "just for testing".
- Let a text-only model handle a task involving media. It will confidently invent image descriptions.
- Treat a system prompt as a security control. If the agent must not do something, remove the capability.

---

## `voice-pipeline`

**When:** speech-to-text or text-to-speech work (D14, `ARCHITECTURE.md` §5.1).

**Steps**
1. STT is Groq `whisper-large-v3`. Limits: 25 MB per file, 20 req/min, 28,800 audio-seconds/day. Check duration before upload.
2. **Always show the transcript for correction before drafting.** Uzbek accuracy is materially worse than English or Russian.
3. Let Whisper detect the language rather than assuming — the author speaks all three.
4. TTS is best-effort. The site must render perfectly with no audio present. Never make layout depend on an audio file existing.
5. Discard raw audio once the draft is created. Voice notes are personal data and do not belong in long-term storage.

**Gotchas**
- Groq TTS (Orpheus) is Preview status — it can change or vanish. Keep Workers AI TTS behind it.
- A spoken command is a *proposal*, not an instruction. It goes through the same confirmation as everything else.

---

## `platform-connector`

**When:** adding or changing a distribution channel (Telegram, LinkedIn, Threads).

**Steps**
1. Implement against the shared distribution interface so fan-out stays uniform.
2. Persist the returned platform message ID in D1. Without it, later edits and deletes orphan the remote post — v1 already hit this.
3. Handle partial failure: three platforms, one fails, the other two must still succeed and the failure must be visible.
4. Generate a platform-appropriate variant. Do not post identical text everywhere.
5. Rate-limit and retry with backoff. Never retry a publish without an idempotency check — duplicate posts are worse than a failed one.

**Never** add X/Twitter (D7): no account, no free tier.

---

## `i18n-string`

**When:** adding or changing any user-facing text.

**Steps**
1. Add the key to **all three** of `src/i18n/{uz,en,ru}.json`. A missing key must never render as a raw key.
2. Never hardcode display text in a component.
3. No string concatenation for sentences — word order differs across the three languages. Use full templated strings with placeholders.
4. Dates and numbers go through locale-aware formatting.

**Gotchas**
- Uzbek text runs longer than English. Test layouts at the longest variant, not the shortest.
- Slugs stay canonical across languages; only titles translate.

---

## `repo-security-pass`

**When:** before any release, and after touching auth, publishing, or content rendering.

**Checklist**
1. `git grep -iE "ghp_|bot[0-9]{6,}:|sk-|api[_-]?key"` — no secret in tracked files or history.
2. No token in `localStorage`, `sessionStorage`, or any inline script.
3. Every Worker route except `/auth` verifies the session.
4. Session cookies are `HttpOnly; Secure; SameSite`, and revocable server-side.
5. Markdown → HTML passes through a real sanitiser. Escaping alone is not sanitisation.
6. URLs interpolated into HTML attributes are escaped — v1's `src="${b.url}"` is the pattern to never repeat.
7. No `dangerouslySetInnerHTML`-equivalent on unsanitised content.
8. External links carry `rel="noopener noreferrer"`.

**Note for Phase 2:** the existing GitHub and Telegram tokens have been sitting in browser storage. **Rotate both** when the Worker lands. Treat them as compromised.
