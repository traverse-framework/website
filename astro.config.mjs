import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://traverse-framework.com',
  output: 'static',
  build: {
    format: 'file',
  },
  trailingSlash: 'never',
});
