import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'danger';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  href?: string;
  children: ReactNode;
};

const variantClass: Record<Variant, string> = {
  default: 'admin-btn',
  primary: 'admin-btn admin-btn--primary',
  danger: 'admin-btn admin-btn--danger',
};

/** Admin button / link built on `admin-btn` tokens. */
export function Button({
  variant = 'default',
  href,
  className,
  children,
  type = 'button',
  ...rest
}: Props) {
  const classes = [variantClass[variant], className].filter(Boolean).join(' ');

  if (href) {
    return (
      <a className={classes} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
