/** Served from /spa.html; they never load or report analytics. */
const PRIVATE_PATH = /^\/(?:admin|auth)(?:[/?#]|$)/;

export const isPrivatePath = (pathname: string): boolean =>
  PRIVATE_PATH.test(pathname);
