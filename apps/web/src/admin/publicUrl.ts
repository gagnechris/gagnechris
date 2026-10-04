// The admin app runs on its own host, so a root-relative path would open the
// admin app instead of the public page.
export const publicSiteOrigin = (): string =>
  import.meta.env.VITE_PUBLIC_SITE_ORIGIN;

export const publicUrl = (path: string): string =>
  new URL(path, publicSiteOrigin()).href;

/** Points root-relative links in rendered public HTML at the public site, in a new tab. */
export const withPublicLinks = (html: string): string => {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const link of template.content.querySelectorAll<HTMLAnchorElement>(
    'a[href^="/"]:not([href^="//"])',
  )) {
    link.setAttribute('href', publicUrl(link.getAttribute('href')!));
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener');
  }
  return template.innerHTML;
};
