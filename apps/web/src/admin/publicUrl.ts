// The admin app runs on its own host, so a root-relative path would open the
// admin app instead of the public page.
export const publicSiteOrigin = (): string =>
  import.meta.env.VITE_PUBLIC_SITE_ORIGIN;

export const publicUrl = (path: string): string =>
  new URL(path, publicSiteOrigin()).href;

const ROOT_RELATIVE = (attribute: string) =>
  `[${attribute}^="/"]:not([${attribute}^="//"])`;

/** Points root-relative links and images in rendered public HTML at the public site; links open in a new tab. */
export const withPublicUrls = (html: string): string => {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const link of template.content.querySelectorAll<HTMLAnchorElement>(
    `a${ROOT_RELATIVE('href')}`,
  )) {
    link.setAttribute('href', publicUrl(link.getAttribute('href')!));
    link.setAttribute('target', '_blank');
    // noreferrer keeps the admin host out of the public site's analytics referrals.
    link.setAttribute('rel', 'noopener noreferrer');
  }
  for (const image of template.content.querySelectorAll<HTMLImageElement>(
    `img${ROOT_RELATIVE('src')}`,
  )) {
    image.setAttribute('src', publicUrl(image.getAttribute('src')!));
  }
  return template.innerHTML;
};
