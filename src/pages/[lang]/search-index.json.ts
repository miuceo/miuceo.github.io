import { getCollection } from 'astro:content';
import { LANGS, t, type Lang } from '../../lib/i18n';
import { resolveLocalized } from '../../lib/artifacts';
import type { APIContext } from 'astro';

export function getStaticPaths() {
  return LANGS.map((lang) => ({ params: { lang } }));
}

export async function GET(context: APIContext) {
  const lang = context.params.lang as Lang;
  const strings = t(lang);

  const allPosts = await getCollection('posts');
  const posts = allPosts
    .filter((entry) => entry.slug.endsWith(`/${lang}`))
    .map((entry) => {
      const slug = entry.slug.split('/')[0];
      return {
        kind: 'post' as const,
        title: entry.data.title,
        desc: entry.data.excerpt ?? '',
        url: `/${lang}/posts/${slug}/`,
      };
    });

  const allProjects = (await getCollection('projects')).sort((a, b) => a.data.order - b.data.order);
  const projects = allProjects.map((p) => ({
    kind: 'project' as const,
    title: p.data.title[lang],
    desc: p.data.description[lang],
    tags: p.data.tags.join(' '),
    url: p.data.url,
    external: p.data.external,
  }));

  const allArtifacts = (await getCollection('artifacts')).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
  const artifacts = allArtifacts.map((a) => ({
    kind: 'artifact' as const,
    title: resolveLocalized(a.data.title, lang),
    desc: a.data.description ? resolveLocalized(a.data.description, lang) : '',
    tags: a.data.tags.join(' '),
    url: `/${lang}/artifacts/${a.id}/`,
  }));

  const actions = [
    { kind: 'action' as const, action: 'theme', title: strings.search.actionTheme, desc: '' },
    { kind: 'action' as const, title: strings.search.actionCv, desc: 'PDF', url: '/cv/muhammadjon-ibrohimov-cv-en.pdf', external: true },
    { kind: 'action' as const, title: strings.search.actionTelegram, desc: '@muhammadibrohimov_ceo', url: 'https://t.me/muhammadibrohimov_ceo', external: true },
    { kind: 'action' as const, title: strings.search.actionGithub, desc: '@miuceo', url: 'https://github.com/miuceo', external: true },
  ];

  return new Response(
    JSON.stringify({
      actions,
      posts,
      projects,
      artifacts,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    }
  );
}
