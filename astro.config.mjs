import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://traverse-framework.com',
  output: 'static',
  build: {
    format: 'file',
  },
  trailingSlash: 'never',
  integrations: [
    sitemap({
      serialize(item) {
        // build.format 'file' emits .html pages; make sitemap URLs match canonicals
        const url = new URL(item.url);
        if (url.pathname !== '/' && !url.pathname.endsWith('.html')) {
          item.url = `${url.origin}${url.pathname}.html`;
        }
        return item;
      },
    }),
  ],
});
