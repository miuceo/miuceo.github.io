import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://muhammadjon.me',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'uz',
        locales: { uz: 'uz-UZ', en: 'en-US', ru: 'ru-RU' },
      },
      // Admin tooling (Phase 4's Mini App editor) is noindex and must not
      // appear in the public sitemap alongside content pages.
      filter: (page) => !page.includes('/post-builder/'),
    }),
  ],
});
