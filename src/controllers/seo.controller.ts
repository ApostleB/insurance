import type { RequestHandler } from 'express';
import { env } from '../config/env';

/** sitemap에 포함할 정적 페이지 목록 */
const STATIC_PATHS: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: '/', changefreq: 'monthly', priority: '1.0' },
  { path: '/story', changefreq: 'weekly', priority: '0.8' },
  { path: '/consultation', changefreq: 'monthly', priority: '0.9' },
  { path: '/claim', changefreq: 'monthly', priority: '0.9' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
];

export const sitemap: RequestHandler = (_req, res) => {
  const lastmod = new Date().toISOString().slice(0, 10);

  const urls = STATIC_PATHS.map(
    ({ path, changefreq, priority }) => `  <url>
    <loc>${env.SITE_ORIGIN}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
  ).join('\n');

  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`);
};

export const robots: RequestHandler = (_req, res) => {
  res.type('text/plain').send(`User-agent: *
Allow: /
Disallow: /health
Disallow: /admin

Sitemap: ${env.SITE_ORIGIN}/sitemap.xml
`);
};
