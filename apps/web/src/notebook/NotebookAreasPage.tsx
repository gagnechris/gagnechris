import { useRef, useState, type FormEvent, type PointerEvent } from 'react';
import {
  errorMessage,
  useNotebookAreasQuery,
  useSaveNotebookAreasMutation,
  type NotebookAreaEntry,
} from '@gagnechris/app-core';
import {
  NOTEBOOK_AREA_NAME_MAX_LENGTH,
  NOTEBOOK_AREAS_MAX,
  notebookAreaIdFromName,
} from '@gagnechris/shared';
import {
  Button,
  DragHandle,
  Field,
  IconButton,
  TextInput,
  useDragReorder,
} from '@gagnechris/ui';
import { appConfirm } from '../workspace/confirmDialog';
import ShellIcon from '../workspace/ui/ShellIcon';

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

function AreaRow({
  area,
  index,
  count,
  taken,
  busy,
  onRename,
  onMove,
  onDrop,
  onDragStart,
  onRemove,
}: {
  area: NotebookAreaEntry;
  index: number;
  count: number;
  taken: (name: string) => boolean;
  busy: boolean;
  onRename: (name: string) => void;
  onMove: (by: -1 | 1) => void;
  onDrop: () => void;
  onDragStart: (e: PointerEvent<HTMLButtonElement>) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(area.name);
  const [prevSaved, setPrevSaved] = useState(area.name);
  if (prevSaved !== area.name) {
    setPrevSaved(area.name);
    setName(area.name);
  }
  const trimmed = name.trim();
  const problem =
    trimmed === ''
      ? 'An area needs a name.'
      : trimmed !== area.name && taken(trimmed)
        ? 'Another area has this name.'
        : null;
  const commit = () => {
    if (problem || trimmed === area.name) return;
    onRename(trimmed);
  };

  return (
    <li className="notebook-areas__row">
      <Field label={`Area ${index + 1}`} hint={problem ?? undefined}>
        <TextInput
          value={name}
          maxLength={NOTEBOOK_AREA_NAME_MAX_LENGTH}
          aria-invalid={problem ? true : undefined}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              setName(area.name);
            }
          }}
        />
      </Field>
      <div className="notebook-areas__actions">
        <DragHandle
          item={area.name}
          position={index + 1}
          count={count}
          onMove={onMove}
          onDrop={onDrop}
          onPointerDown={onDragStart}
        />
        <IconButton
          variant="danger"
          label={`Remove ${area.name}`}
          disabled={busy || count === 1}
          onClick={onRemove}
        >
          <ShellIcon name="close" />
        </IconButton>
      </div>
    </li>
  );
}

function NewAreaForm({
  areas,
  busy,
  onAdd,
}: {
  areas: readonly NotebookAreaEntry[];
  busy: boolean;
  onAdd: (area: NotebookAreaEntry) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const full = areas.length >= NOTEBOOK_AREAS_MAX;
  const trimmed = name.trim();
  const taken = areas.some((a) => sameName(a.name, trimmed));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || taken || full) return;
    const id = notebookAreaIdFromName(
      trimmed,
      areas.map((a) => a.id),
    );
    if (await onAdd({ id, name: trimmed })) setName('');
  };

  return (
    <form className="notebook-areas__new" onSubmit={(e) => void submit(e)}>
      <Field
        label="New area"
        hint={
          full
            ? `You can have up to ${NOTEBOOK_AREAS_MAX} areas. Remove one to add another.`
            : taken
              ? 'Another area has this name.'
              : undefined
        }
      >
        <TextInput
          value={name}
          maxLength={NOTEBOOK_AREA_NAME_MAX_LENGTH}
          placeholder="Name, like Family"
          disabled={full}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="notebook-areas__actions">
        <Button
          type="submit"
          variant="primary"
          disabled={full || busy || !trimmed || taken}
        >
          Add area
        </Button>
      </div>
    </form>
  );
}

export default function NotebookAreasPage() {
  const query = useNotebookAreasQuery();
  const save = useSaveNotebookAreasMutation();
  const areas = query.data?.areas ?? [];

  const write = async (next: NotebookAreaEntry[]) => {
    try {
      await save.mutateAsync(next);
      return true;
    } catch {
      return false;
    }
  };

  // A drag or a keyboard pick-up reorders locally; the drop saves once.
  const [order, setOrder] = useState<NotebookAreaEntry[] | null>(null);
  const shown = order ?? areas;
  const list = useRef<HTMLOListElement>(null);

  const move = (from: number, to: number) => {
    if (save.isPending || to < 0 || to >= shown.length || to === from) return;
    const next = [...shown];
    next.splice(to, 0, ...next.splice(from, 1));
    setOrder(next);
  };

  const drop = async (next: NotebookAreaEntry[] | null) => {
    if (next?.some((a, i) => a.id !== areas[i]?.id)) await write(next);
    setOrder(null);
  };

  const drag = useDragReorder({
    ids: shown.map((a) => a.id),
    list,
    onMove: move,
    onDrop: () => void drop(order),
  });

  const remove = async (area: NotebookAreaEntry) => {
    const ok = await appConfirm(
      `Remove ${area.name}? Its daily template goes with it. An area with notes or tasks can’t be removed.`,
      'Remove',
    );
    if (ok) void write(areas.filter((a) => a.id !== area.id));
  };

  return (
    <section className="workspace-panel">
      <div className="workspace-action-bar">
        <div className="notebook-today__title">
          <p className="notebook-today__kicker">Settings</p>
          <h1>Areas</h1>
        </div>
      </div>
      <p className="workspace-panel__lede">
        Each area has its own daily notes, tasks and daily template. The area
        switch shows them in this order. Up to {NOTEBOOK_AREAS_MAX}.
      </p>
      {query.error ? (
        <p className="workspace-panel__error" role="alert">
          {errorMessage(query.error, 'Could not load your areas.')}
        </p>
      ) : query.isPending ? (
        <p>Loading areas…</p>
      ) : (
        <div className="notebook-areas">
          <ol ref={list} className="notebook-areas__list" aria-label="Areas">
            {shown.map((area, index) => (
              <AreaRow
                key={area.id}
                area={area}
                index={index}
                count={shown.length}
                busy={save.isPending}
                taken={(name) =>
                  areas.some((a) => a.id !== area.id && sameName(a.name, name))
                }
                onRename={(name) =>
                  void write(
                    areas.map((a) => (a.id === area.id ? { ...a, name } : a)),
                  )
                }
                onMove={(by) => move(index, index + by)}
                onDrop={() => void drop(order)}
                onDragStart={drag.start(area.id)}
                onRemove={() => void remove(area)}
              />
            ))}
          </ol>
          {save.error ? (
            <p className="workspace-panel__error" role="alert">
              {errorMessage(save.error, 'Could not save your areas.')}
            </p>
          ) : null}
          <NewAreaForm
            areas={areas}
            busy={save.isPending}
            onAdd={(area) => write([...areas, area])}
          />
          <p className="kit-hint">
            Renaming an area keeps its notes and tasks. A new area starts with a
            blank daily template.
          </p>
        </div>
      )}
    </section>
  );
}
