import type { ReactNode } from 'react';
import { findTaskEmbeds } from '@gagnechris/shared';
import { renderMarkdownToHtml } from '@gagnechris/shared/render';

type MarkdownPreviewProps = {
  markdown: string;
  /** Renders `{{task:…}}` lines live; without it they stay plain text. */
  renderTaskEmbed?: (id: string) => ReactNode;
};

type Segment =
  | { kind: 'markdown'; source: string; key: number }
  | { kind: 'embed'; id: string; indent: string; key: number };

function segmentsOf(markdown: string): Segment[] {
  const lines = markdown.split('\n');
  const segments: Segment[] = [];
  let start = 0;
  for (const embed of findTaskEmbeds(markdown)) {
    if (embed.line > start) {
      segments.push({
        kind: 'markdown',
        source: lines.slice(start, embed.line).join('\n'),
        key: start,
      });
    }
    segments.push({
      kind: 'embed',
      id: embed.id,
      indent: embed.indent,
      key: embed.line,
    });
    start = embed.line + 1;
  }
  if (start < lines.length) {
    segments.push({
      kind: 'markdown',
      source: lines.slice(start).join('\n'),
      key: start,
    });
  }
  return segments;
}

export default function MarkdownPreview({
  markdown,
  renderTaskEmbed,
}: MarkdownPreviewProps) {
  if (!renderTaskEmbed) {
    return (
      <div
        className="markdown-preview"
        // Shared renderer output — identical to publisher HTML.
        dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(markdown) }}
      />
    );
  }
  // Embed lines split the body, so each side renders on its own.
  return (
    <div className="markdown-preview">
      {segmentsOf(markdown).map((segment) =>
        segment.kind === 'markdown' ? (
          <div
            key={segment.key}
            className="markdown-preview__chunk"
            dangerouslySetInnerHTML={{
              __html: renderMarkdownToHtml(segment.source),
            }}
          />
        ) : (
          <div
            key={segment.key}
            className="markdown-preview__embed"
            style={{ paddingInlineStart: `${segment.indent.length / 2}em` }}
          >
            {renderTaskEmbed(segment.id)}
          </div>
        ),
      )}
    </div>
  );
}
