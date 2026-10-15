/** @jsxRuntime automatic */
import { cx } from './cx.js';

/** The backdrop behind every modal surface; clicking it closes. */
export const Scrim = ({
  onClick,
  label = 'Close',
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) => (
  <button
    type="button"
    tabIndex={-1}
    aria-label={label}
    className={cx('ui-scrim', className)}
    onClick={onClick}
  />
);
