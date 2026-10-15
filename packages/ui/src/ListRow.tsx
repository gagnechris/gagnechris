/** @jsxRuntime automatic */
import type { ComponentProps, ReactNode } from 'react';
import { cx } from './cx.js';

export const List = ({
  className,
  children,
  ...rest
}: ComponentProps<'ul'>) => (
  <ul className={cx('ui-list', className)} {...rest}>
    {children}
  </ul>
);

type Props = {
  title: ReactNode;
  /** Makes the title a link to the item. */
  href?: string;
  /** Makes the title a button, when the row opens something in place. */
  onClick?: () => void;
  meta?: ReactNode;
  /** A Checkbox, DragHandle or icon before the title. */
  leading?: ReactNode;
  /** Badges and chips, always shown. */
  trailing?: ReactNode;
  /** IconButtons shown on hover and focus on desktop, always on touch screens. */
  actions?: ReactNode;
  current?: boolean;
  className?: string;
};

/** One row of a List: leading control, title and meta, trailing badges and actions. */
export const ListRow = ({
  title,
  href,
  onClick,
  meta,
  leading,
  trailing,
  actions,
  current,
  className,
}: Props) => {
  const titleClass = 'ui-row__title';
  const currentAttr = current ? ('true' as const) : undefined;
  return (
    <li className={cx('ui-row', current && 'ui-row--current', className)}>
      {leading ? <span className="ui-row__leading">{leading}</span> : null}
      <span className="ui-row__main">
        {href ? (
          <a className={titleClass} href={href} aria-current={currentAttr}>
            {title}
          </a>
        ) : onClick ? (
          <button
            type="button"
            className={titleClass}
            aria-current={currentAttr}
            onClick={onClick}
          >
            {title}
          </button>
        ) : (
          <span className={titleClass}>{title}</span>
        )}
        {meta ? <span className="ui-row__meta">{meta}</span> : null}
      </span>
      {trailing ? <span className="ui-row__trailing">{trailing}</span> : null}
      {actions ? <span className="ui-row__actions">{actions}</span> : null}
    </li>
  );
};
