/** @jsxRuntime automatic */
import type { ComponentType, ReactNode } from 'react';
import { cx, type Tone } from './cx.js';

type LinkProps = { href: string; className?: string; children: ReactNode };

const PlainLink = ({ href, className, children }: LinkProps) => (
  <a className={className} href={href}>
    {children}
  </a>
);

type DataAttributes = { [key: `data-${string}`]: string | undefined };

type Props = DataAttributes & {
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
  /** Editorial: a line above the title, such as a status. */
  kicker?: ReactNode;
  /** Editorial: the title's heading level. */
  headingLevel?: 2 | 3 | 4;
  /** Editorial: `li` for an entry in a `ul` or `ol`. */
  as?: 'article' | 'li';
  /** Editorial: renders the title link, such as a router link. */
  linkAs?: ComponentType<LinkProps>;
  /** Makes the whole card one link (editorial: the title is the link, and its hit area covers the card). */
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
  kicker,
  headingLevel = 3,
  as: Root = 'article',
  linkAs: Link = PlainLink,
  href,
  onClick,
  className,
  ...data
}: Props) => {
  if (tone === 'editorial') {
    const Heading = `h${headingLevel}` as const;
    return (
      <Root className={cx('ui-card--editorial', className)} {...data}>
        {preview ? <div className="ui-card__preview">{preview}</div> : null}
        <div className="ui-card__body">
          {kicker}
          {title ? (
            <Heading className="ui-card__title">
              {href ? (
                <Link className="ui-card__link" href={href}>
                  {title}
                </Link>
              ) : (
                title
              )}
            </Heading>
          ) : null}
          {meta ? <p className="ui-card__meta">{meta}</p> : null}
          {children}
        </div>
      </Root>
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
      <a
        className={classes}
        href={href}
        aria-current={selected || undefined}
        {...data}
      >
        {content}
      </a>
    );
  if (onClick)
    return (
      <button
        type="button"
        {...data}
        className={classes}
        aria-pressed={selected}
        onClick={onClick}
      >
        {content}
      </button>
    );
  return (
    <div className={classes} {...data}>
      {content}
    </div>
  );
};
