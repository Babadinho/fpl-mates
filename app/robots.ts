import type { MetadataRoute } from 'next';
import { getConfig } from '@/lib/config';

/**
 * Crawling is allowed even when indexing is not, which looks backwards but is
 * the correct way round.
 *
 * `Disallow: /` stops a crawler fetching the page — and a crawler that cannot
 * fetch the page never sees the `noindex` tag on it. Google's documented
 * behaviour in that case is to index the URL anyway, from links alone, with no
 * content. Blocking also breaks link previews: the WhatsApp and Facebook
 * scrapers honour robots.txt, so a blanket disallow would leave the share card
 * blank.
 *
 * So: let them in, and let the `noindex` in the page metadata do the work.
 */
export default function robots(): MetadataRoute.Robots {
  const { site } = getConfig();

  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: site.allowIndexing ? `${site.url}/sitemap.xml` : undefined,
  };
}
