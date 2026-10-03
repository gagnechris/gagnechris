import { renderMarkdownToHtml } from '@gagnechris/shared/render';

type MarkdownPreviewProps = {
  markdown: string;
};

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
