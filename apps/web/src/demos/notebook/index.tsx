import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Button } from '../../kit/Button';
import { parseLocalDate } from '../../kit/calendarDates';
import { DemoFrame } from '../../kit/demo/DemoFrame';
import { useDemoReducer } from '../../kit/demo/useDemoReducer';
import { TaskEmbedRow } from '../../kit/tasks/TaskEmbedRow';
import { taskDue } from '../../kit/tasks/taskDue';
import { taskScheduleLabel } from '../../kit/tasks/taskScheduleLabel';
import { TaskSyntaxInput } from '../../kit/tasks/TaskSyntaxInput';
import { ComingUpPanel, StillOpenPanel } from '../../kit/tasks/TodayPanels';
import {
  NOTEBOOK_DEMO_NOTE,
  notebookDemoHintText,
  notebookDemoReducer,
  notebookDemoView,
  seedNotebookDemo,
  type NotebookDemoAction,
  type NotebookDemoState,
} from './notebookDemoState';
import '../../kit/markdown/markdown.css';
import './notebook.css';

/** notebook.css switches to the phone layout at the same width. */
export const NOTEBOOK_DEMO_PHONE_QUERY = '(max-width: 760px)';

const PLACEHOLDER = {
  wide: 'Type a task, then Enter. Try: Call Sam @mon !high',
  narrow: 'Try: Call Sam @mon !high',
};

const note = (
  <>
    <span className="notebook-demo__wide">{NOTEBOOK_DEMO_NOTE.wide}</span>
    <span className="notebook-demo__narrow">
      <span aria-hidden="true">· </span>
      {NOTEBOOK_DEMO_NOTE.narrow}
    </span>
  </>
);

const resetLabel = (
  <>
    <span className="notebook-demo__wide">Reset demo</span>
    <span className="notebook-demo__narrow">Reset</span>
  </>
);

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia?.(query);
      mql?.addEventListener('change', onChange);
      return () => mql?.removeEventListener('change', onChange);
    },
    () => Boolean(window.matchMedia?.(query).matches),
  );
}

export default function NotebookDemo() {
  const { state, dispatch, reset } = useDemoReducer(
    notebookDemoReducer,
    seedNotebookDemo,
  );
  return (
    <DemoFrame
      layout="split"
      note={note}
      resetLabel={resetLabel}
      onReset={reset}
    >
      {(resetButton) => (
        <NotebookDemoBody
          state={state}
          dispatch={dispatch}
          resetButton={resetButton}
        />
      )}
    </DemoFrame>
  );
}

function NotebookDemoBody({
  state,
  dispatch,
  resetButton,
}: {
  state: NotebookDemoState;
  dispatch: (action: NotebookDemoAction) => void;
  resetButton: ReactNode;
}) {
  const phone = useMediaQuery(NOTEBOOK_DEMO_PHONE_QUERY);
  const view = notebookDemoView(state);
  const noteRef = useRef<HTMLUListElement>(null);
  const [focusTask, setFocusTask] = useState<string | null>(null);
  const hintId = useId();
  const { today } = state;

  // "+ Note" removes its own row; keep the keyboard on the task it moved.
  useEffect(() => {
    if (!focusTask) return;
    noteRef.current
      ?.querySelector<HTMLInputElement>(`[data-task-id="${focusTask}"] input`)
      ?.focus();
  }, [focusTask, state.noteTaskIds]);

  const stillOpen = (
    <StillOpenPanel
      compact
      rows={view.stillOpen}
      onAddToNote={(id) => {
        dispatch({ type: 'add-to-note', id });
        setFocusTask(id);
      }}
    />
  );
  const comingUp = (
    <ComingUpPanel
      compact
      days={view.comingUp}
      day={today}
      onToggle={(id) => dispatch({ type: 'toggle', id })}
    />
  );

  return (
    <div className="notebook-demo">
      <header className="notebook-demo__bar">
        <div>
          <p className="notebook-demo__kicker">Work notebook</p>
          <h3 className="notebook-demo__day">
            {parseLocalDate(today)?.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            }) ?? today}
          </h3>
        </div>
        {resetButton}
      </header>
      <div className="notebook-demo__body">
        <section className="notebook-demo__note" aria-label="Today’s note">
          <p className="notebook-demo__note-title">Standup</p>
          <p className="notebook-demo__note-text">
            Sidebar spec is next, then the phone layout.
          </p>
          <ul className="notebook-demo__tasks" ref={noteRef}>
            {view.noteTasks.map((task) => (
              <li key={task.id} data-task-id={task.id}>
                <TaskEmbedRow
                  view={{
                    kind: 'task',
                    task,
                    schedule:
                      task.status === 'done'
                        ? undefined
                        : taskScheduleLabel(
                            task.startDate,
                            today,
                            task.someday,
                          ),
                    due: taskDue(task, today),
                    onToggle: () => dispatch({ type: 'toggle', id: task.id }),
                  }}
                />
              </li>
            ))}
          </ul>
          <form
            className="notebook-demo__add"
            onSubmit={(e) => {
              e.preventDefault();
              dispatch({ type: 'add' });
            }}
          >
            <span className="task-embed__box" aria-hidden="true" />
            <TaskSyntaxInput
              value={state.draft}
              onChange={(value) => dispatch({ type: 'type', value })}
              today={today}
              aria-label="New task"
              aria-describedby={hintId}
              placeholder={phone ? PLACEHOLDER.narrow : PLACEHOLDER.wide}
              className="notebook-demo__input"
            />
            <Button type="submit" variant="primary">
              Add
            </Button>
          </form>
          <p className="notebook-demo__hint" id={hintId} aria-live="polite">
            {notebookDemoHintText(state.hint, today)}
          </p>
        </section>
        {phone ? (
          <PanelTabs
            stillOpenCount={view.stillOpen.length}
            comingUpCount={view.comingUpCount}
            stillOpen={stillOpen}
            comingUp={comingUp}
          />
        ) : (
          <div className="notebook-demo__side">
            {stillOpen}
            {comingUp}
          </div>
        )}
      </div>
    </div>
  );
}

type Tab = 'still-open' | 'coming-up';

/** On phones the side panels become tabs under the note. */
function PanelTabs({
  stillOpenCount,
  comingUpCount,
  stillOpen,
  comingUp,
}: {
  stillOpenCount: number;
  comingUpCount: number;
  stillOpen: ReactNode;
  comingUp: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('still-open');
  const baseId = useId();
  const tabs: [Tab, string][] = [
    ['still-open', `Still open · ${stillOpenCount}`],
    ['coming-up', `Coming up · ${comingUpCount}`],
  ];
  const tabsRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: Tab = tab === 'still-open' ? 'coming-up' : 'still-open';
    setTab(next);
    tabsRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)
      ?.focus();
  };

  return (
    <div className="notebook-demo__panels">
      <div
        className="notebook-demo__tabs"
        role="tablist"
        aria-label="Tasks outside the note"
        ref={tabsRef}
        onKeyDown={onKeyDown}
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            data-tab={id}
            id={`${baseId}-${id}-tab`}
            aria-selected={tab === id}
            aria-controls={`${baseId}-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className="notebook-demo__tab"
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tabs.map(([id]) => (
        <div
          key={id}
          role="tabpanel"
          id={`${baseId}-${id}`}
          aria-labelledby={`${baseId}-${id}-tab`}
          hidden={tab !== id}
          className="notebook-demo__tabpanel"
        >
          {id === 'still-open' ? stillOpen : comingUp}
        </div>
      ))}
    </div>
  );
}
