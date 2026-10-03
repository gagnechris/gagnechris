import {
  replaceMeta,
  upsertCanonical,
  upsertMeta,
} from '@gagnechris/shared/render';

export type PageMetaInput = {
  title: string;
  description: string;
  url: string;
  type: 'website' | 'article';
  image?: string;
  jsonLd?: string;
  articlePublishedTime?: string;
};

export function applyPageMeta(shellHtml: string, meta: PageMetaInput): string {
  let html = shellHtml;
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    () => `<title>${meta.title}</title>`,
  );
  html = replaceMeta(html, 'name', 'description', meta.description);
  html = replaceMeta(html, 'property', 'og:title', meta.title);
  html = replaceMeta(html, 'property', 'og:description', meta.description);
  html = replaceMeta(html, 'property', 'og:type', meta.type);
  html = replaceMeta(html, 'property', 'og:url', meta.url);
  if (meta.image) {
    html = replaceMeta(html, 'property', 'og:image', meta.image);
  }
  html = replaceMeta(html, 'name', 'twitter:title', meta.title);
  html = replaceMeta(html, 'name', 'twitter:description', meta.description);
  if (meta.image) {
    html = replaceMeta(html, 'name', 'twitter:image', meta.image);
  }
  if (meta.articlePublishedTime) {
    html = upsertMeta(
      html,
      'property',
      'article:published_time',
      meta.articlePublishedTime,
    );
  }
  html = upsertCanonical(html, meta.url);
  if (meta.jsonLd) {
    html = html.replace(
      /<\/head>/i,
      () => `<script type="application/ld+json">${meta.jsonLd}</script></head>`,
    );
  }
  return html;
}
