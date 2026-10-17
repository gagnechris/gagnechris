import {
  indentWidth,
  markdownItemBlock as blockAt,
  noteHeadings,
  reindent,
  removeTaskBlock,
  sectionEnd,
  TASK_NEST_WIDTH,
  taskDropNestIndent,
  taskEmbedLineOf as embedLine,
  taskNestIndent,
  type LineBlock,
} from '@gagnechris/shared';

export { blockAt, embedLine, noteHeadings, removeTaskBlock };

const reindentBlock = (
  lines: readonly string[],
  { first, last }: LineBlock,
  delta: number,
) =>
  [
    ...lines.slice(0, first),
    reindent(lines.slice(first, last + 1).join('\n'), delta),
    ...lines.slice(last + 1),
  ].join('\n');

/**
 * Indent makes the task, with its lines, a subtask of the task above it at
 * its level; Outdent takes it out a level. Null when it can't.
 */
export function indentTaskBlock(
  markdown: string,
  taskId: string,
  dir: 'in' | 'out',
): string | null {
  const lines = markdown.split('\n');
  const line = embedLine(markdown, taskId);
  if (line === null) return null;
  const indent = indentWidth(lines[line]!);
  let delta = -TASK_NEST_WIDTH;
  if (dir === 'in') {
    const nested = taskNestIndent(lines, line);
    if (nested === null) return null;
    delta = nested - indent;
  } else if (indent === 0) {
    return null;
  }
  return reindentBlock(lines, blockAt(lines, line), delta);
}

/**
 * A drag sideways onto the task line above: a subtask of a top-level task,
 * or a sibling of a subtask. Null when it would not nest.
 */
function nestTaskBlock(markdown: string, taskId: string): string | null {
  const lines = markdown.split('\n');
  const line = embedLine(markdown, taskId);
  if (line === null) return null;
  const indent = indentWidth(lines[line]!);
  const target = taskDropNestIndent(lines, line - 1, line);
  if (target === null || target <= indent) return null;
  return reindentBlock(lines, blockAt(lines, line), target - indent);
}

/**
 * A dropped row: its block moves to `target`, and a drag sideways nests it
 * under the task line it lands below or takes it out a level. Null when
 * nothing changes.
 */
export function dropTaskBlock(
  markdown: string,
  taskId: string,
  target: { before: string } | { after: string } | null,
  level: 'in' | 'out' | null,
): string | null {
  const moved = target ? moveTaskBlock(markdown, taskId, target) : null;
  const leveled =
    level === 'in'
      ? nestTaskBlock(moved ?? markdown, taskId)
      : level === 'out'
        ? indentTaskBlock(moved ?? markdown, taskId, 'out')
        : null;
  const next = leveled ?? moved;
  return next === markdown ? null : next;
}

/** Puts the task's block last in the section under the `index`th `##` heading. */
export function moveTaskBlockToSection(
  markdown: string,
  taskId: string,
  index: number,
): string | null {
  const lines = markdown.split('\n');
  const line = embedLine(markdown, taskId);
  const headings = noteHeadings(lines);
  const heading = headings[index];
  if (line === null || !heading) return null;
  const block = blockAt(lines, line);
  const before = sectionEnd(lines, headings, heading, block);
  if (before >= block.first && before <= block.last + 1) return null;
  const rows = lines.slice(block.first, block.last + 1);
  const rest = [...lines.slice(0, block.first), ...lines.slice(block.last + 1)];
  const at = before > block.last ? before - rows.length : before;
  return [...rest.slice(0, at), ...rows, ...rest.slice(at)].join('\n');
}

/**
 * The task's line and the lines under it, with the row's own indent taken
 * off, for another note.
 */
export function taskBlockLines(markdown: string, taskId: string) {
  const lines = markdown.split('\n');
  const line = embedLine(markdown, taskId);
  if (line === null) return null;
  const { first, last } = blockAt(lines, line);
  return reindent(
    lines.slice(first, last + 1).join('\n'),
    -indentWidth(lines[line]!),
  );
}

/**
 * Moves the task's block to just before the line of `before`, or just after
 * the block of `after`. Null when it would not move.
 */
export function moveTaskBlock(
  markdown: string,
  taskId: string,
  target: { before: string } | { after: string },
): string | null {
  const lines = markdown.split('\n');
  const line = embedLine(markdown, taskId);
  const other = embedLine(
    markdown,
    'before' in target ? target.before : target.after,
  );
  if (line === null || other === null) return null;
  const block = blockAt(lines, line);
  const at = 'before' in target ? other : blockAt(lines, other).last + 1;
  if (at >= block.first && at <= block.last + 1) return null;
  const rows = lines.slice(block.first, block.last + 1);
  const rest = [...lines.slice(0, block.first), ...lines.slice(block.last + 1)];
  const to = at > block.last ? at - rows.length : at;
  return [...rest.slice(0, to), ...rows, ...rest.slice(to)].join('\n');
}
