/**
 * Simple frontmatter parser for browser use
 * Parses YAML frontmatter from markdown content
 */
export interface FrontmatterResult {
  data: Record<string, string>;
  content: string;
}

export function parseFrontmatter(markdown: string): FrontmatterResult {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = markdown.match(frontmatterRegex);

  if (!match) {
    return {
      data: {},
      content: markdown,
    };
  }

  const [, frontmatter, content] = match;
  const data: Record<string, string> = {};

  // Parse simple YAML key-value pairs
  const lines = frontmatter.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      data[key] = value;
    }
  }

  return {
    data,
    content: content.trim(),
  };
}
