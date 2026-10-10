import { DAILY_TEMPLATE_DATE_TOKEN } from '@gagnechris/shared';

export type Selection = { start: number; end: number };
export type TextEdit = { text: string; selection: Selection };

export type ToolbarAction =
  | 'task'
  | 'date'
  | 'priority'
  | 'heading'
  | 'list'
  | 'checklist'
  | 'dateToken'
  | 'link';

const lineStart = (text: string, offset: number) =>
  text.lastIndexOf('\n', offset - 1) + 1;

const INDENT = /^[ \t]*/;

/** Adds `marker` after the line's indent, or takes it off if it is there. */
const toggleLineMarker = (
  text: string,
  { start, end }: Selection,
  marker: string,
  existing: RegExp,
): TextEdit => {
  const from = lineStart(text, start);
  const indent = INDENT.exec(text.slice(from))![0].length;
  const at = from + indent;
  const current = existing.exec(text.slice(at))?.[0];
  if (current) {
    const shift = (n: number) =>
      n >= at ? Math.max(at, n - current.length) : n;
    return {
      text: text.slice(0, at) + text.slice(at + current.length),
      selection: { start: shift(start), end: shift(end) },
    };
  }
  const shift = (n: number) => (n >= at ? n + marker.length : n);
  return {
    text: text.slice(0, at) + marker + text.slice(at),
    selection: { start: shift(start), end: shift(end) },
  };
};

/** Types `token` at the caret, replacing any selection, as its own word. */
const insertWord = (
  text: string,
  { start, end }: Selection,
  token: string,
): TextEdit => {
  const before = text.slice(0, start);
  const lead = before === '' || /\s$/.test(before) ? '' : ' ';
  const insert = lead + token;
  const caret = start + insert.length;
  return {
    text: before + insert + text.slice(end),
    selection: { start: caret, end: caret },
  };
};

/** What each Notes keyboard toolbar button does to the focused text. */
export function applyToolbarAction(
  text: string,
  selection: Selection,
  action: ToolbarAction,
): TextEdit {
  switch (action) {
    case 'task':
      return toggleLineMarker(text, selection, '[ ] ', /^\[[ xX]\][ \t]+/);
    case 'heading':
      return toggleLineMarker(text, selection, '# ', /^#{1,6}[ \t]+/);
    case 'list':
      return toggleLineMarker(text, selection, '- ', /^[-*+][ \t]+/);
    case 'checklist':
      return toggleLineMarker(
        text,
        selection,
        '- [ ] ',
        /^[-*+][ \t]+\[[ xX]\][ \t]+/,
      );
    case 'dateToken':
      return insertWord(text, selection, DAILY_TEMPLATE_DATE_TOKEN);
    case 'date':
      return insertWord(text, selection, '@');
    case 'priority':
      return insertWord(text, selection, '!');
    case 'link': {
      const { start, end } = selection;
      const label = text.slice(start, end);
      const insert = `[${label}]()`;
      // With a label the caret waits for the URL; without, for the label.
      const caret = label ? start + insert.length - 1 : start + 1;
      return {
        text: text.slice(0, start) + insert + text.slice(end),
        selection: { start: caret, end: caret },
      };
    }
  }
}
