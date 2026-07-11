#!/usr/bin/env node
// Generates a single, flat dist/sitemap.xml directly from the built pages.
// Replaces @astrojs/sitemap, which unconditionally wraps output in a
// sitemap-index.xml -> sitemap-N.xml pair even for small sites with no
// need for it -- this keeps the deployed output to one clean file.

import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SITE = 'https://traverse-framework.com';
const DIST = new URL('../dist', import.meta.url).pathname;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (entry.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

const htmlFiles = walk(DIST).sort();

const urls = htmlFiles.map((file) => {
  const rel = relative(DIST, file).replace(/\\/g, '/');
  const path = rel === 'index.html' ? '' : `/${rel}`;
  return `${SITE}${path}`;
});

const body = urls.map((u) => `<url><loc>${u}</loc></url>`).join('');
const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>\n`;

writeFileSync(join(DIST, 'sitemap.xml'), xml, 'utf-8');
console.log(`sitemap.xml written with ${urls.length} URLs`);
