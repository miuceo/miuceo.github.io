import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  site: 'https://muhammadjon.me',
  output: 'static',
  trailingSlash: 'always',
  prefetch: true,
  devToolbar: {
    enabled: false
  },
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
  // Dev-only: serves `astro dev` over HTTPS with a self-signed cert (browser
  // will warn once, click through). Doesn't touch the production build —
  // GitHub Pages/Cloudflare still terminate TLS themselves.
  vite: {
    plugins: [basicSsl()],
    server: { https: true },
  },
});
