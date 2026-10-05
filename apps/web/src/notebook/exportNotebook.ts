import type { Note, Task } from '@gagnechris/app-core';
import { replaceTaskEmbeds, taskEmbedFallbackLine } from '@gagnechris/shared';

/** General-purpose flag bit 11: file names are UTF-8, not CP437. */
const UTF8_NAMES = 0x0800;

/** Minimal ZIP (store / no compression) for browser downloads. */
export function buildZip(files: Record<string, string | Uint8Array>): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, n, true);
    return b;
  };
  const u32 = (n: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return b;
  };
  const concat = (chunks: Uint8Array[]) => {
    const len = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  };
  const crc32 = (data: Uint8Array) => {
    let c = ~0;
    for (let i = 0; i < data.length; i += 1) {
      c ^= data[i]!;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
      }
    }
    return ~c >>> 0;
  };

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data =
      typeof content === 'string' ? encoder.encode(content) : content;
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(UTF8_NAMES),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    parts.push(local);
    const centralHeader = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(UTF8_NAMES),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    central.push(centralHeader);
    offset += local.length;
  }

  const centralDir = concat(central);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(Object.keys(files).length),
    u16(Object.keys(files).length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return new Blob([concat([...parts, centralDir, end])], {
    type: 'application/zip',
  });
}

/** Exported files read on their own: embeds become plain checklist lines. */
export function noteToMarkdown(
  note: Note,
  tasksById: ReadonlyMap<string, Pick<Task, 'title' | 'status'>> = new Map(),
): string {
  // A JSON string is a YAML double-quoted scalar, so every value reads back as
  // the same string: no plain-scalar typing (`true`, `2026`, `null`) or syntax.
  const q = (value: string) => JSON.stringify(value);
  const tags =
    note.tags.length > 0 ? `\ntags: [${note.tags.map(q).join(', ')}]` : '';
  const dateLine = note.date ? `\ndate: ${q(note.date)}` : '';
  const frontmatter = `---
id: ${q(note.id)}
area: ${q(note.area)}
type: ${q(note.type)}${dateLine}
title: ${q(note.title)}
pinned: ${note.pinned}${tags}
updatedAt: ${q(note.updatedAt)}
---

`;
  const body = replaceTaskEmbeds(note.bodyMarkdown, (embed) =>
    taskEmbedFallbackLine(embed, tasksById.get(embed.id)),
  );
  return `${frontmatter}${body.trimEnd()}\n`;
}

export function noteExportPath(note: Note): string {
  const safe = (note.title.trim() || 'untitled')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const folder = note.type === 'daily' ? 'daily' : 'pages';
  const stamp = note.date ?? note.id.slice(0, 8);
  return `notes/${folder}/${stamp}-${safe || 'note'}-${note.id.slice(-6)}.md`;
}

export function buildNotebookExportZip(
  notes: Note[],
  tasks: Task[],
): { blob: Blob; fileCount: number } {
  const files: Record<string, string> = {};
  const liveTasks = tasks.filter((t) => !t.deleted);
  const tasksById = new Map(liveTasks.map((t) => [t.id, t]));
  for (const note of notes.filter((n) => !n.deleted)) {
    files[noteExportPath(note)] = noteToMarkdown(note, tasksById);
  }
  files['tasks.json'] = `${JSON.stringify(liveTasks, null, 2)}\n`;
  files['README.md'] = `# Notebook export

Generated for personal backup / migration.

- \`notes/daily/\` and \`notes/pages/\` — one Markdown file per note (YAML frontmatter); embedded tasks are written as \`- [ ] Title\`, \`- [x] Title\` when done and \`- [ ] ~~Title~~ (dropped)\` when dropped
- \`tasks.json\` — all non-deleted tasks

This is a **human export**, not a DynamoDB restore. Infra PITR / AWS Backup remains the path for table recovery (see \`infra/RUNBOOK.md\`).
`;
  return { blob: buildZip(files), fileCount: Object.keys(files).length };
}

const REVOKE_DELAY_MS = 60_000;

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari can still be starting the download when click() returns.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
