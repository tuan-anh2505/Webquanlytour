import { useEffect } from 'react';

/** Cập nhật title, canonical, mô tả và JSON-LD khi chuyển trang React; server cũng render meta khi bật phục vụ dist. */
export function usePageMeta({ title, description = '', path = '/', image, data, index = true }) {
  const serialized = data ? JSON.stringify(data) : '';
  useEffect(() => {
    if (!title) return;
    document.title = title;
    const setMeta = (key, value, property = false) => {
      const attribute = property ? 'property' : 'name';
      let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
      if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.appendChild(element); }
      element.content = value;
    };
    let canonical = document.head.querySelector('link[rel="canonical"]');
    const base = (import.meta.env?.VITE_SITE_URL || (canonical ? new URL(canonical.href).origin : window.location.origin)).replace(/\/$/, '');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = base + path;
    setMeta('description', description.slice(0, 500)); setMeta('robots', index ? 'index,follow' : 'noindex,nofollow');
    setMeta('og:title', title, true); setMeta('og:description', description.slice(0, 500), true); setMeta('og:url', canonical.href, true);
    setMeta('og:type', data?.['@type'] === 'Article' ? 'article' : 'website', true);
    const oldImage = document.head.querySelector('meta[property="og:image"]');
    try {
      const imageUrl = image ? new URL(image, base) : null;
      if (imageUrl && ['http:', 'https:'].includes(imageUrl.protocol)) setMeta('og:image', imageUrl.href, true); else oldImage?.remove();
    } catch { oldImage?.remove(); }
    let script = document.getElementById('page-jsonld');
    if (serialized) { if (!script) { script = document.createElement('script'); script.id = 'page-jsonld'; script.type = 'application/ld+json'; document.head.appendChild(script); } script.textContent = serialized; }
    else script?.remove();
  }, [title, description, path, image, serialized, index]);
}
