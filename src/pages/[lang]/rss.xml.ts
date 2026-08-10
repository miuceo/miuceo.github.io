import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { LANGS, t, type Lang } from '../../lib/i18n';
import type { APIContext } from 'astro';

export function getStaticPaths() {
  return LANGS.map((lang) => ({ params: { lang } }));
}

export async function GET(context: APIContext) {
  const lang = context.params.lang as Lang;
  const strings = t(lang);
  const allPosts = await getCollection('posts');
  const items = allPosts
    .filter((entry) => entry.slug.endsWith(`/${lang}`))
    .map((entry) => {
      const slug = entry.slug.split('/')[0];
      return {
        title: entry.data.title,
        description: entry.data.excerpt ?? '',
        pubDate: entry.data.createdAt,
        link: `/${lang}/posts/${slug}/`,
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
