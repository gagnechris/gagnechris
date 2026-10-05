import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EditorView } from '@codemirror/view';
import {
  hideKeyboard,
  makeTaskLine,
  startPriority,
  startTaskDate,
  toggleLinePrefix,
} from './editorAccessory';

type Props = {
  getView: () => EditorView | undefined;
  /** Task and date buttons, for notes that embed tasks. */
  tasks: boolean;
};

const icon = (path: ReactNode) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {path}
  </svg>
);

/**
 * Phone formatting bar pinned above the on-screen keyboard. Its buttons never
 * take focus, so the editor and the keyboard stay up.
 */
export function EditorAccessoryBar({ getView, tasks }: Props) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // The keyboard opening shrinks the viewport; keep the caret's line clear.
    const reveal = () => {
      const view = getView();
      if (!view?.hasFocus) return;
      view.dispatch({
        effects: EditorView.scrollIntoView(view.state.selection.main.head, {
          y: 'nearest',
        }),
      });
    };
    vv.addEventListener('resize', reveal);
    return () => vv.removeEventListener('resize', reveal);
  }, [getView]);

  const run = (command: (view: EditorView) => void) => () => {
    const view = getView();
    if (view) command(view);
  };

  return createPortal(
    <div
      role="toolbar"
      aria-label="Formatting"
      className="editor-accessory"
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
    >
      {tasks ? (
        <>
          <button
            type="button"
            className="editor-accessory__btn editor-accessory__btn--task"
            aria-label="Insert task"
            onClick={run(makeTaskLine)}
          >
            {icon(
              <>
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="m8 12 3 3 5-6" />
              </>,
            )}
            Task
          </button>
          <button
            type="button"
            className="editor-accessory__btn"
            aria-label="Show on date"
            onClick={run(startTaskDate)}
          >
            {icon(
              <>
                <rect x="3" y="4" width="18" height="17" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </>,
            )}
          </button>
          <button
            type="button"
            className="editor-accessory__btn editor-accessory__btn--text"
            aria-label="Priority"
            onClick={run(startPriority)}
          >
            !
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="editor-accessory__btn editor-accessory__btn--text"
        aria-label="Heading"
        onClick={run((view) => toggleLinePrefix(view, '## '))}
      >
        H
      </button>
      <button
        type="button"
        className="editor-accessory__btn"
        aria-label="Bulleted list"
        onClick={run((view) => toggleLinePrefix(view, '- '))}
      >
        {icon(<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />)}
      </button>
      <span className="editor-accessory__spacer" />
      <button
        type="button"
        className="editor-accessory__btn"
        aria-label="Hide keyboard"
        onClick={run(hideKeyboard)}
      >
        {icon(<path d="m6 9 6 6 6-6" />)}
      </button>
    </div>,
    document.body,
  );
}
