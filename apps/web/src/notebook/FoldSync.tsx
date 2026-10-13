import { useEffect } from 'react';

/** Keeps the editor's hidden lines in step with the row's folded state. */
export function FoldSync({
  fold,
  folded,
}: {
  fold: (folded: boolean) => void;
  folded: boolean;
}) {
  useEffect(() => {
    fold(folded);
  }, [fold, folded]);
  return null;
}
