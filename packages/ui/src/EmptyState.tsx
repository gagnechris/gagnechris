/** @jsxRuntime automatic */
import type { ReactNode } from 'react';
import { cx } from './cx.js';

type Props = {
  title: string;
  /** A ShellIcon at size 32. */
  icon?: ReactNode;
  children?: ReactNode;
  /** An optional `md` Button. */
  action?: ReactNode;
  className?: string;
};

/** A centred block for an empty list or page. */
export const EmptyState = ({
  title,
  icon,
  children,
  action,
  className,
}: Props) => (
  <div className={cx('ui-empty', className)}>
    {icon ? (
      <span className="ui-empty__icon" aria-hidden="true">
        {icon}
      </span>
    ) : null}
    <p className="ui-empty__title">{title}</p>
    {children ? <p className="ui-empty__text">{children}</p> : null}
    {action ? <div className="ui-empty__action">{action}</div> : null}
  </div>
);
