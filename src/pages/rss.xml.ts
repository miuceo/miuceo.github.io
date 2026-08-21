import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { t } from '../lib/i18n';
import type { APIContext } from 'astro';

/**
 * The canonical /rss.xml, in Uzbek — the same feed as /uz/rss.xml, kept at the
 * root because that is the address readers have already subscribed to.
 *
 * It used to be written by post-builder straight into the repo root, linking
 * each item at v1's /posts/<slug>.html. Those pages are no longer generated
 * for new posts, so a hand-written feed would have started emitting dead
 * links. Generating it from the content collection instead means the feed
 * cannot drift from what the site actually publishes.
 *
 * One-time consequence of the switch: item guids move from
 * /posts/<slug>.html to /uz/posts/<slug>/, so existing subscribers see the
 * back catalogue once more. Unavoidable when the permalink shape changes, and
 * preferable to a feed of 404s.
 */
export async function GET(context: APIContext) {
  const strings = t('uz');
  const allPosts = await getCollection('posts');
  const items = allPosts
    .filter((entry) => entry.slug.endsWith('/uz'))
    .map((entry) => {
      const slug = entry.slug.split('/')[0];
      return {
        title: entry.data.title,
        description: entry.data.excerpt ?? '',
        pubDate: entry.data.createdAt,
        link: `/uz/posts/${slug}/`,
      };
    })
    .sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

  return rss({
    title: strings.meta.siteTitle,
    description: strings.meta.siteDescription,
    site: context.site!,
    items,
  });
}
