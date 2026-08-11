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
    tags: z.array(z.string()).default([]), // proper nouns — deliberately not translated
    url: z.string(), // absolute URL for external projects, or a site-relative path like "/post-builder.html"
    external: z.boolean().default(true),
    order: z.number().default(0),
  }),
});

export const collections = { posts, projects };
