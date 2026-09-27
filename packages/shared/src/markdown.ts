import { marked } from 'marked';

/** Shared markdown → HTML for editor preview and the publisher Lambda. */
marked.setOptions({
  gfm: true,
  breaks: false,
});

export const renderMarkdownToHtml = (markdown: string): string => {
  return marked.parse(markdown ?? '', { async: false }) as string;
};
