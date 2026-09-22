import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    excerpt: z.string().optional(),
    coverImage: z.string().url().optional(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    telegramMessageId: z.number().optional(),
    telegramHasMedia: z.boolean().optional(),
  }),
});

/**
 * Translated text is required in all three languages, so a missing one fails
 * the build instead of silently rendering Uzbek on /en/ and /ru/ — which is
 * exactly what happened before this shape existed (SKILLS.md `i18n-string`:
 * "a missing key must never render as a raw key").
 *
 * Projects keep their translations in frontmatter rather than one file per
 * language the way posts do. A post body is long-form Markdown that needs its
 * own file; a project description is a single sentence, and splitting it into
 * three files would duplicate `url`, `tags` and `order` three ways for nothing.
 */
const translated = z.object({
  uz: z.string(),
  en: z.string(),
  ru: z.string(),
});

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    title: translated,
    description: translated,
    // "Problem → solution → result" — optional so older/minor entries can omit it,
    // but every project added going forward should carry all three.
    problem: translated.optional(),
    solution: translated.optional(),
    result: translated.optional(),
    tags: z.array(z.string()).default([]), // proper nouns — deliberately not translated
    status: z.enum(['active', 'archived']).default('active'),
    url: z.string(), // absolute URL for external projects, or a site-relative path like "/post-builder.html"
    // "owner/repo" for a build-time GitHub stars lookup (src/lib/github.ts). Omit for
    // internal tools (e.g. Post Builder) that aren't their own repo.
    githubRepo: z.string().optional(),
    external: z.boolean().default(true),
    order: z.number().default(0),
  }),
});

/**
 * A single artifact's metadata. The HTML itself lives outside this
 * collection, as a static file under `public/artifacts/files/<slug>.html` —
 * it is opaque bytes served to a sandboxed iframe, not content Astro ever
 * parses or renders.
 *
 * `title`/`description` accept either a plain string (shown as-is in every
 * language) or a partial translation — `en`/`ru` are optional and fall back
 * to `uz` (see `resolveLocalized` in `src/lib/artifacts.ts`), matching the
 * site's "author writes Uzbek, translation is optional extra work" model
 * rather than `projects`' fully-required `translated`.
 */
const localized = z.union([
  z.string(),
  z.object({ uz: z.string(), en: z.string().optional(), ru: z.string().optional() }),
]);

const artifacts = defineCollection({
  type: 'data',
  schema: z.object({
    title: localized,
    model: z.string(), // "Claude" | "Gemini" | "ChatGPT" | free text
    description: localized.optional(),
    file: z.string(), // "/artifacts/files/<slug>.html"
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    prompt: z.string().optional(),
    // true if the artifact calls api.anthropic.com or window.storage and
    // therefore only runs inside claude.ai, not in this site's sandboxed iframe.
    requiresClaude: z.boolean().default(false),
    license: z.string().optional(),
  }),
});

export const collections = { posts, projects, artifacts };
