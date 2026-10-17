// Matches --note-column-min in shell.css.
export const NOTE_COLUMN_MIN = 480;

/** How far a panel may still grow before the note column drops below its minimum. */
export function noteColumnRoom(): number {
  const column = document.querySelector('.notebook-column');
  const width = column?.getBoundingClientRect().width ?? 0;
  // Zero means not laid out (or no column on this page): nothing to protect.
  return width > 0 ? width - NOTE_COLUMN_MIN : Infinity;
}
