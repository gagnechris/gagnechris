/** Served from /spa.html; they never load or report analytics. */
const PRIVATE_PATH = /^\/(?:admin|auth)(?:[/?#]|$)/i;

const safeDecode = (pathname: string): string => {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
};

/** Case- and encoding-insensitive: React Router decodes and ignores case unless told otherwise. */
export const isPrivatePath = (pathname: string): boolean =>
  PRIVATE_PATH.test(pathname) || PRIVATE_PATH.test(safeDecode(pathname));
