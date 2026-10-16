import { liveMarkdownLines } from '@gagnechris/shared';

/** The native view's hash: 32-bit, over the UTF-16 code units. */
export function liveMarkdownHash(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * What the native view styles `markdown` with, as JSON. With
 * `resolveImage`, a line holding only an image shows it from that URL.
 */
export function liveMarkdownDecorations(
  markdown: string,
  resolveImage?: (src: string) => string,
): string {
  const lines = liveMarkdownLines(markdown, {
    images: Boolean(resolveImage),
  }).map(({ style, marks, image }) => ({
    ...(style ? { style } : {}),
    ...(marks.length
      ? {
          marks: marks.map(({ from, to, kind, href }) => ({
            f: from,
            t: to,
            k: kind,
            ...(kind === 'link' && href ? { h: href } : {}),
          })),
        }
      : {}),
    ...(image && resolveImage
      ? { image: { f: image.from, t: image.to, src: resolveImage(image.src) } }
      : {}),
  }));
  return JSON.stringify({ hash: liveMarkdownHash(markdown), lines });
}
