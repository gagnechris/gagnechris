import { confirmAction, nativeConfirm } from '../ui/confirm';

export const UNPUBLISH_PROMPT = 'unpublish';
export const DISCARD_PROMPT = 'discard';
export const DELETE_PROMPT = 'delete';

/** app-core's confirm for a publishable editor; `noun` is "post" or "project". */
export const publishableConfirm =
  (noun: string, unpublishMessage: string) =>
  (message: string): Promise<boolean> => {
    switch (message) {
      case UNPUBLISH_PROMPT:
        return confirmAction(
          `Unpublish this ${noun}?`,
          unpublishMessage,
          'Unpublish',
        );
      case DISCARD_PROMPT:
        return confirmAction(
          'Discard unpublished changes?',
          `The ${noun} goes back to what’s published.`,
          'Discard',
        );
      case DELETE_PROMPT:
        return confirmAction(
          `Delete this ${noun}?`,
          'It leaves the admin. Only the API can bring it back.',
          'Delete',
        );
      default:
        return nativeConfirm(message);
    }
  };
