import { useEffect, useRef, useState } from 'react';
import { Button } from '../kit/Button';
import {
  experienceRangeError,
  roleTitle,
  type ExperienceDraft,
} from './resumeDraft';

type Props = {
  roles: ExperienceDraft[];
  onReorder: (from: number, to: number) => void;
  onOpen: (roleId: string) => void;
  onAdd: () => void;
};

const monthLabel = (month: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return '';
  return new Date(Date.UTC(+match[1]!, +match[2]! - 1)).toLocaleDateString(
    'en-US',
    { month: 'short', year: 'numeric', timeZone: 'UTC' },
  );
};

const roleDatesLabel = (role: ExperienceDraft) => {
  const start = monthLabel(role.start);
  if (!start) return '';
  const end = role.present ? 'Present' : monthLabel(role.end);
  return end ? `${start} – ${end}` : start;
};

export function ResumeRoleList({ roles, onReorder, onOpen, onAdd }: Props) {
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const move = (from: number, to: number) => {
    if (to < 0 || to >= roles.length || to === from) return;
    onReorder(from, to);
    setAnnouncement(
      `${roleTitle(roles[from]!)} moved to position ${to + 1} of ${roles.length}`,
    );
  };
  const moveRef = useRef(move);
  useEffect(() => {
    moveRef.current = move;
  });

  // Window listeners, not pointer capture: reordering moves the row's DOM
  // node, which drops capture mid-drag.
  useEffect(() => {
    if (!draggingId) return;
    const onMove = (e: PointerEvent) => {
      const from = roles.findIndex((role) => role.id === draggingId);
      const to = roles.findIndex((role) => {
        const rect = rowRefs.current.get(role.id)?.getBoundingClientRect();
        return rect ? e.clientY >= rect.top && e.clientY < rect.bottom : false;
      });
      if (from >= 0 && to >= 0) moveRef.current(from, to);
    };
    const stop = () => setDraggingId(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [draggingId, roles]);

  return (
    <>
      <ul className="admin-row-list" aria-label="Roles">
        {roles.map((role, index) => {
          const dates = roleDatesLabel(role);
          const sub = [role.company.trim(), dates].filter(Boolean).join(' · ');
          return (
            <li
              key={role.id}
              ref={(el) => {
                if (el) rowRefs.current.set(role.id, el);
                else rowRefs.current.delete(role.id);
              }}
              data-dragging={draggingId === role.id || undefined}
            >
              <button
                type="button"
                className="admin-row-handle"
                aria-label={`Reorder ${roleTitle(role)}`}
                aria-describedby="resume-role-reorder-hint"
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDraggingId(role.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    move(index, index - 1);
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    move(index, index + 1);
                  }
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  {[5, 12, 19].flatMap((y) =>
                    [9, 15].map((x) => (
                      <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />
                    )),
                  )}
                </svg>
              </button>
              <button
                type="button"
                className="admin-row"
                onClick={() => onOpen(role.id)}
              >
                <span className="admin-row__text">
                  <span className="admin-row__title">{roleTitle(role)}</span>
                  {sub ? <span className="admin-row__sub">{sub}</span> : null}
                </span>
                {experienceRangeError(role) ? (
                  <span className="admin-badge admin-badge--unpublished">
                    Check dates
                  </span>
                ) : null}
                <svg
                  className="admin-row__chevron"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
      <p id="resume-role-reorder-hint" className="admin-hint">
        Open a role to edit it. Drag the handle, or focus it and press the up
        and down arrows, to reorder.
      </p>
      <span className="admin-visually-hidden" aria-live="polite">
        {announcement}
      </span>
      <Button className="admin-row-list__add" onClick={onAdd}>
        Add role
      </Button>
    </>
  );
}
