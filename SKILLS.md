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
| [`v1-safe-edit`](#v1-safe-edit) | Touching `public/login.html` or `public/admin.html` | **High** |
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

**When:** editing `public/login.html` or `public/admin.html` — the two v1 pages still in service.

**These are load-bearing.** `login.html` issues the session and `/post-builder/` redirects to it when there isn't one, so breaking it locks the author out of publishing entirely. `admin.html` is the post list and the only way to delete a post.

**Steps**
1. Read the whole file first. These are single-file pages with inline `<style>` and `<script>`; context lives above and below the edit.
2. Match the existing style: 2-space indent, compact one-line CSS rules, no build step, no dependencies.
3. Never introduce a framework, bundler, or npm package into these files.
4. They live in `public/`, so Astro serves them verbatim — check with `npm run build` and open `dist/`.
5. If the change touches deletion, walk the full flow: load posts → delete → confirm all three language files went and the channel message was removed.

**Never**
- Delete either file. There is no other session issuer and no other post list.
- Edit the root duplicates — there are none any more, and recreating them reintroduces the drift that got them deleted.
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

**The rule that outranks everything: the LLM returns text, never publishes (D6).**

**Give it one job.** There is no agent here any more (D15): each task in `agent.ts` has one prompt, one caller, and one shape of output. If a feature seems to need the model to *decide* what to do next, that is the signal to write the branch yourself instead.

**Steps**
1. Call through the single interface in `worker/src/agent.ts`. Never import a provider SDK into feature code.
2. Go through `walkLadder` so the task inherits the Groq→OpenRouter fallback for free. Its `validate` callback is where you reject an unusable reply — a throw there advances the ladder exactly like a provider error.
3. Pick the route by task, not habit — see the routing table in `ARCHITECTURE.md` §10. Multimodal work goes to OpenRouter; fast text goes to Groq.
4. Model IDs live in Worker config, never in code. **The free roster rotates** — a hardcoded ID is a future outage.
5. Set `max_tokens` from what the reply actually needs. Groq checks its per-minute quota against the *requested* value, not actual usage, so asking for 32,000 tokens for a two-field JSON object gets the call rejected outright.
6. Constrain the output and check it. A prompt saying "do not summarise" is not enough on its own — add a cheap assertion (length ratio, required field, scaffolding check) that fails loudly.
7. Surface output to the human for approval. Always.

**Never**
- Fall back to "use the raw output" on a parse failure. That shipped chain-of-thought and raw JSON as published article bodies once already. Truncation, `<think>` blocks and scaffolding are hard failures.
- Add Gemini or Claude (D13). Not as a fallback, not "just for testing".
- Let a text-only model handle a task involving media. It will confidently invent image descriptions.
- Treat a system prompt as a security control. If the model must not do something, remove the capability.

---

## `voice-pipeline`

**When:** speech-to-text or text-to-speech work (D14, D17, `ARCHITECTURE.md` §5.1).

**Steps**
1. STT is Groq `whisper-large-v3`. Limits: 25 MB per file, 20 req/min, 28,800 audio-seconds/day. Check size before upload.
2. **Speech may only produce text for the author to read. It must never cause an action.** Dictation into the editor satisfies this by construction. If you build a path where speech triggers something, put a confirmation in front of it — that is what D14 is.
3. **Pin `uz`, do not detect.** The author writes Uzbek. Auto-detection reads Uzbek as Turkish and then decodes the whole recording with the wrong phonetics. Pass the orthography hint too.
4. Follow the transcript with a correction pass, and keep that pass narrow — punctuation, capitalisation, orthography. Guard it: a model told to "clean up" text will sometimes return a summary of it.
5. Discard raw audio once transcribed. Voice notes are personal data; there is deliberately no storage helper for them.
6. TTS is unbuilt and best-effort if ever added. The site must render perfectly with no audio present.

**Gotchas**
- **Groq decides an audio format from the filename extension**, not the bytes or the Content-Type. Telegram's `.oga` was rejected until renamed; browsers differ too (WebM/Opus in Chrome, MP4/AAC in Safari). Choose container and extension together.
- Uzbek accuracy is a property of the model. Pinning and hinting help materially; neither closes the gap. The author reading the result is the mitigation that matters.
- Groq TTS (Orpheus) is Preview status — it can change or vanish.

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
