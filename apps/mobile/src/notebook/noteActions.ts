import {
  useDeleteNoteMutation,
  usePinNoteMutation,
  type Note,
} from '@gagnechris/app-core';
import { useCallback } from 'react';
import { ActionSheetIOS } from 'react-native';
import { confirmAction, showError } from '../ui/confirm';
import type { RowAction } from '../ui/NoteRow';

export const deleteNoteTitle = (note: Pick<Note, 'type'>) =>
  note.type === 'daily' ? 'Delete this daily note?' : 'Delete this page?';

export const deleteNoteMessage = (note: Pick<Note, 'type'>) =>
  note.type === 'daily'
    ? 'That day starts again with an empty note.'
    : 'It will disappear from your list.';

/** Pin / Unpin and Delete for a note row, each confirmed. */
export function useNoteRowActions() {
  const pin = usePinNoteMutation();
  const remove = useDeleteNoteMutation();

  const actionsFor = useCallback(
    (note: Note): RowAction[] => {
      const pinned = note.pinned;
      return [
        {
          name: pinned ? 'unpin' : 'pin',
          label: pinned ? 'Unpin' : 'Pin',
          run: () => {
            void (async () => {
              const ok = await confirmAction(
                pinned ? 'Unpin this note?' : 'Pin this note?',
                pinned
                  ? 'It moves back under its day.'
                  : 'It stays at the top of Notes.',
                pinned ? 'Unpin' : 'Pin',
                false,
              );
              if (!ok) return;
              try {
                await pin.mutateAsync({ note, pinned: !pinned });
              } catch {
                showError(
                  'Could not change the pin',
                  'Pull to refresh and try again.',
                );
              }
            })();
          },
        },
        {
          name: 'delete',
          label: 'Delete',
          run: () => {
            void (async () => {
              const ok = await confirmAction(
                deleteNoteTitle(note),
                deleteNoteMessage(note),
                'Delete',
              );
              if (!ok) return;
              try {
                await remove.mutateAsync({
                  id: note.id,
                  version: note.version,
                });
              } catch {
                showError(
                  'Could not delete the note',
                  'Pull to refresh and try again.',
                );
              }
            })();
          },
        },
      ];
    },
    [pin, remove],
  );

  const showActions = useCallback((title: string, actions: RowAction[]) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...actions.map((a) => a.label), 'Cancel'],
        destructiveButtonIndex: actions.findIndex((a) => a.name === 'delete'),
        cancelButtonIndex: actions.length,
      },
      (index) => actions[index]?.run(),
    );
  }, []);

  return { actionsFor, showActions };
}
