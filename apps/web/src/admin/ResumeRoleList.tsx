import { useRef, useState } from 'react';
import {
  formatResumeShortMonth,
  RESUME_MONTH_PATTERN,
} from '@gagnechris/shared';
import {
  Button,
  DragHandle,
  List,
  ListRow,
  useDragReorder,
} from '@gagnechris/ui';
import {
  experienceRangeError,
  roleTitle,
  type ExperienceDraft,
} from '@gagnechris/app-core';

type Props = {
  roles: ExperienceDraft[];
  onReorder: (from: number, to: number) => void;
  onOpen: (roleId: string) => void;
  onAdd: () => void;
};

const monthLabel = (month: string) =>
  RESUME_MONTH_PATTERN.test(month) ? formatResumeShortMonth(month) : '';

const roleDatesLabel = (role: ExperienceDraft) => {
  const start = monthLabel(role.start);
  if (!start) return '';
  const end = role.present ? 'Present' : monthLabel(role.end);
  return end ? `${start} – ${end}` : start;
};

export function ResumeRoleList({ roles, onReorder, onOpen, onAdd }: Props) {
  const list = useRef<HTMLUListElement>(null);
  const [announcement, setAnnouncement] = useState('');

  const move = (from: number, to: number) => {
    if (to < 0 || to >= roles.length || to === from) return false;
    onReorder(from, to);
    return true;
  };
  const dragTo = (from: number, to: number) => {
    if (move(from, to)) {
      setAnnouncement(
        `${roleTitle(roles[from]!)} moved to position ${to + 1} of ${roles.length}`,
      );
    }
  };
  const drag = useDragReorder({
    ids: roles.map((role) => role.id),
    list,
    onMove: dragTo,
  });

  return (
    <>
      <List ref={list} className="admin-row-list" aria-label="Roles">
        {roles.map((role, index) => {
          const dates = roleDatesLabel(role);
          const sub = [role.company.trim(), dates].filter(Boolean).join(' · ');
          return (
            <ListRow
              key={role.id}
              className={
                drag.dragging === role.id ? 'admin-row--dragging' : undefined
              }
              leading={
                <DragHandle
                  item={roleTitle(role)}
                  position={index + 1}
                  count={roles.length}
                  aria-describedby="resume-role-reorder-hint"
                  onMove={(by) => move(index, index + by)}
                  onPointerDown={drag.start(role.id)}
                />
              }
              title={roleTitle(role)}
              meta={sub || undefined}
              onClick={() => onOpen(role.id)}
              trailing={
                experienceRangeError(role) ? (
                  <span className="kit-badge kit-badge--unpublished">
                    Check dates
                  </span>
                ) : undefined
              }
            />
          );
        })}
      </List>
      <p id="resume-role-reorder-hint" className="kit-hint">
        Open a role to edit it. Drag the handle, or focus it and press Space,
        then the up and down arrows, to reorder.
      </p>
      <span className="kit-visually-hidden" aria-live="polite">
        {announcement}
      </span>
      <Button className="admin-row-list__add" onClick={onAdd}>
        Add role
      </Button>
    </>
  );
}
