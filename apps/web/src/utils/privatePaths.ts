/**
 * Private areas served from /spa.html (CloudFront routes them there). They
 * never load or report analytics (CHR-194).
 */
const PRIVATE_PATH = /^\/(?:admin|auth)(?:[/?#]|$)/;

export const isPrivatePath = (pathname: string): boolean =>
  PRIVATE_PATH.test(pathname);
