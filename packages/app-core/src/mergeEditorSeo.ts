/** Merge editor SEO title/description with fields the form does not edit (e.g. ogImage). */
export function mergeEditorSeo(
  existing:
    | { title?: string; description?: string; ogImage?: string }
    | null
    | undefined,
  draft: { seoTitle: string; seoDescription: string },
): { title?: string; description?: string; ogImage?: string } | null {
  const title = draft.seoTitle.trim();
  const description = draft.seoDescription.trim();
  const ogImage = existing?.ogImage;
  if (!title && !description && !ogImage) return null;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(ogImage ? { ogImage } : {}),
  };
}
