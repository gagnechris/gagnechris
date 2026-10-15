import { useState, type ReactNode } from 'react';
import { Button } from '@gagnechris/ui';

/** Overlays cover the docs page, so their stories open from a button. */
export const OpenButton = ({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      {open ? children(() => setOpen(false)) : null}
    </>
  );
};
