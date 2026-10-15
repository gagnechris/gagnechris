import type { ReactNode } from 'react';
import { cx, type Tone } from './cx.js';

type Props = {
  children?: ReactNode;
  title?: ReactNode;
  meta?: ReactNode;
  /** `flat` drops the shadow on a `--neutral-50` fill, for nested groups. */
  variant?: 'boxed' | 'flat';
  selected?: boolean;
  compact?: boolean;
  /** Editorial cards are entries in a ruled list, with a preview column. */
  tone?: Tone;
  preview?: ReactNode;
  /** Makes the whole card one link (editorial: the title is the link). */
  href?: string;
  /** Makes the whole card one button. */
  onClick?: () => void;
  className?: string;
};

export const Card = ({
  children,
  title,
  meta,
  variant = 'boxed',
  selected,
  compact,
  tone = 'default',
  preview,
  href,
  onClick,
  className,
}: Props) => {
  if (tone === 'editorial') {
    return (
      <article className={cx('ui-card--editorial', className)}>
        {preview ? <div className="ui-card__preview">{preview}</div> : null}
        <div className="ui-card__body">
          {title ? (
            <h3 className="ui-card__title">
              {href ? <a href={href}>{title}</a> : title}
            </h3>
          ) : null}
          {meta ? <p className="ui-card__meta">{meta}</p> : null}
          {children}
        </div>
      </article>
    );
  }

  const interactive = Boolean(href || onClick);
  const classes = cx(
    'ui-card',
    variant === 'flat' && 'ui-card--flat',
    selected && 'ui-card--selected',
    compact && 'ui-card--compact',
    interactive && 'ui-card--interactive',
    className,
  );
  const content = (
    <>
      {title ? <span className="ui-card__title">{title}</span> : null}
      {meta ? <span className="ui-card__meta">{meta}</span> : null}
      {children}
    </>
  );
  if (href)
    return (
      <a className={classes} href={href} aria-current={selected || undefined}>
        {content}
      </a>
    );
  if (onClick)
    return (
      <button
        type="button"
        className={classes}
        aria-pressed={selected}
        onClick={onClick}
      >
        {content}
      </button>
    );
  return <div className={classes}>{content}</div>;
};
