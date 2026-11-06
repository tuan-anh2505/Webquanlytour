const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('../config/db');
const Tour = require('../models/TourModel');
const Content = require('../models/ContentModel');
const { getMailConfig } = require('../config/mail');

/** Escape dữ liệu DB khi viết vào HTML/XML; JSON-LD còn escape dấu < để chặn đóng script. */
function escape(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function jsonLd(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
function siteUrl() { return getMailConfig().siteUrl; }

/** Metadata theo cùng dữ liệu công khai với người dùng, không cloaking theo User-Agent. */
async function metadata(route) {
  const company = await Tour.company();
  const name = company?.company_name || 'Hành Trình';
  const base = siteUrl();
  const result = { title: name, description: company?.introduction?.slice(0, 300) || 'Khám phá tour du lịch, lịch khởi hành và hành trình phù hợp.', canonical: base + route, index: ['/', '/articles'].includes(route), content: '', data: { '@context': 'https://schema.org', '@type': 'WebSite', name, url: base } };
  const tourMatch = /^\/tours\/([a-zA-Z0-9_-]+)$/.exec(route);
  const articleMatch = /^\/articles\/([a-zA-Z0-9_-]+)$/.exec(route);
  if (tourMatch) {
    const tour = await Tour.publicDetail(tourMatch[1]);
    result.title = `${tour.meta_title || tour.title} | ${name}`;
    result.description = tour.meta_description || tour.summary || tour.description?.slice(0, 300) || tour.title;
    result.canonical = `${base}/tours/${encodeURIComponent(tour.slug)}`;
    result.image = tour.images[0]?.image_url;
    result.index = true;
    result.content = `<h1>${escape(tour.title)}</h1><p>${escape(tour.summary || '')}</p><p>${escape(tour.description || '')}</p>`;
    result.data = { '@context': 'https://schema.org', '@type': 'TouristTrip', name: tour.title, description: result.description, url: result.canonical };
  } else if (articleMatch) {
    const article = await Content.article(articleMatch[1]);
    result.title = `${article.meta_title || article.title} | ${name}`;
    result.description = article.meta_description || article.summary || article.content.slice(0, 300);
    result.canonical = `${base}/articles/${encodeURIComponent(article.slug)}`;
    result.image = article.cover_image_url;
    result.index = true;
    result.content = `<article><h1>${escape(article.title)}</h1><p>${escape(article.summary || '')}</p><p>${escape(article.content).replace(/\n/g, '<br>')}</p></article>`;
    result.data = { '@context': 'https://schema.org', '@type': 'Article', headline: article.title, description: result.description, mainEntityOfPage: result.canonical, author: { '@type': 'Person', name: article.author_name }, ...(article.cover_image_url ? { image: article.cover_image_url } : {}), ...(article.published_at ? { datePublished: article.published_at.replace(' ', 'T') + '+07:00' } : {}) };
  } else if (route === '/articles') result.title = `Tin tức & cẩm nang | ${name}`;
  return result;
}

/** Chèn meta vào bản build React để crawler nhận được nội dung ngay cả trước khi chạy JS. */
function render(template, meta) {
  let imageTag = '';
  try { const image = meta.image ? new URL(meta.image, siteUrl()) : null; if (image && ['http:', 'https:'].includes(image.protocol)) imageTag = `<meta property="og:image" content="${escape(image.href)}">`; } catch {}
  const clean = template.replace(/<title>[\s\S]*?<\/title>/i, '').replace(/<meta\s+[^>]*name=["']description["'][^>]*>/gi, '').replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, '');
  const head = `<title>${escape(meta.title)}</title><meta name="description" content="${escape(meta.description)}"><meta name="robots" content="${meta.index ? 'index,follow' : 'noindex,nofollow'}"><link rel="canonical" href="${escape(meta.canonical)}"><meta property="og:title" content="${escape(meta.title)}"><meta property="og:description" content="${escape(meta.description)}"><meta property="og:url" content="${escape(meta.canonical)}"><meta property="og:type" content="${meta.data?.['@type'] === 'Article' ? 'article' : 'website'}">${imageTag}<script type="application/ld+json" id="page-jsonld">${jsonLd(meta.data)}</script>`;
  return clean.replace('</head>', head + '</head>').replace('<div id="root"></div>', `<div id="root">${meta.content || ''}</div>`);
}

/** Sitemap chỉ gồm tour active và bài published đúng thời điểm, không có trang quản trị. */
async function sitemap() {
  const [[tours], [articles]] = await Promise.all([
    pool.query("SELECT slug,updated_at FROM tours WHERE status='active' ORDER BY id LIMIT 20000"),
    pool.query("SELECT slug,updated_at FROM articles WHERE status='published' AND published_at<=CURRENT_TIMESTAMP ORDER BY id LIMIT 20000")
  ]);
  const entries = [{ path: '/' }, { path: '/articles' }, ...tours.map(row => ({ path: '/tours/' + encodeURIComponent(row.slug), updated: row.updated_at })), ...articles.map(row => ({ path: '/articles/' + encodeURIComponent(row.slug), updated: row.updated_at }))];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(entry => `<url><loc>${escape(siteUrl() + entry.path)}</loc>${entry.updated ? `<lastmod>${escape(String(entry.updated).slice(0, 10))}</lastmod>` : ''}</url>`).join('')}</urlset>`;
}

/** SEO endpoints luôn có; phục vụ HTML từ dist khi chủ động bật SERVE_FRONTEND. */
function attach(app) {
  app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /api/\nDisallow: /admin\nDisallow: /account\nDisallow: /bookings\nDisallow: /booking/\nDisallow: /payments/\nSitemap: ${siteUrl()}/sitemap.xml\n`));
  app.get('/sitemap.xml', async (req, res) => res.type('application/xml').send(await sitemap()));
  app.get('/api/site-config', (req, res) => res.json({ data: { site_url: siteUrl() } }));
  if (process.env.SERVE_FRONTEND !== 'true') return;
  const dist = path.resolve(__dirname, '../../../frontend/dist');
  app.use('/assets', require('express').static(path.join(dist, 'assets'), { fallthrough: false, index: false }));
  app.get(/^(?!\/api(?:\/|$)|\/assets(?:\/|$)).*/, async (req, res, next) => {
    try {
      const template = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
      const meta = await metadata(req.path);
      const known = meta.index || req.path === '/search' || /^\/(login|register|account|bookings|booking|payments|admin|operations|wishlist|notifications)(\/|$)/.test(req.path);
      res.status(known ? 200 : 404).type('html').send(render(template, meta));
    } catch (error) { next(error); }
  });
}

module.exports = { attach, metadata, render, sitemap, escape, jsonLd, siteUrl };
