import { renderMarkdownToHtml } from '@gagnechris/shared';

type MarkdownPreviewProps = {
  markdown: string;
};

/** Preview using the shared renderer (same as the publisher). */
export default function MarkdownPreview({ markdown }: MarkdownPreviewProps) {
  const html = renderMarkdownToHtml(markdown);
  return (
    <div
      className="markdown-preview"
      // Shared renderer output — identical to publisher HTML.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
