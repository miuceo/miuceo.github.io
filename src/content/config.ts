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

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()).default([]),
    url: z.string(), // absolute URL for external projects, or a site-relative path like "/post-builder.html"
    external: z.boolean().default(true),
    order: z.number().default(0),
  }),
});

export const collections = { posts, projects };
