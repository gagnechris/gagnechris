import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { BottomSheet } from './BottomSheet.js';
import { cx } from './cx.js';
import { Glyph } from './Glyph.js';
import { useDismiss } from './useDismiss.js';
import { usePhone } from './usePhone.js';

const MenuContext = createContext<{ close: () => void } | null>(null);

const ITEMS = '[role^="menuitem"]:not([aria-disabled="true"])';

export type MenuTriggerProps = {
  ref: (el: HTMLElement | null) => void;
  id: string;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
};

type Props = {
  /** Names the menu, and titles it when it opens as a sheet. */
  label: string;
  /** Renders the button that opens the menu; spread the props onto it. */
  trigger: (props: MenuTriggerProps) => ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: number;
  className?: string;
};

/**
 * A menu opened from a trigger. Arrows move, typing jumps, Enter picks,
 * Escape and an outside click close and return focus to the trigger. Under
 * 768px the same items open in a BottomSheet.
 */
export const Menu = ({
  label,
  trigger,
  children,
  align = 'start',
  width,
  className,
}: Props) => {
  const id = useId();
  const menuId = `${id}-menu`;
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<'first' | 'last'>('first');
  const anchor = useRef<HTMLSpanElement>(null);
  const [triggerEl, setTriggerEl] = useState<HTMLElement | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const phone = usePhone();

  const close = useCallback(
    (returnFocus = true) => {
      setOpen(false);
      if (returnFocus) triggerEl?.focus();
    },
    [triggerEl],
  );

  const dismiss = useCallback(() => {
    const focusInside = menu.current?.contains(document.activeElement);
    close(Boolean(focusInside));
  }, [close]);

  useDismiss(open && !phone, dismiss, anchor);

  useEffect(() => {
    if (!open || phone) return;
    const items = menu.current?.querySelectorAll<HTMLElement>(ITEMS);
    if (!items?.length) return;
    items[start === 'first' ? 0 : items.length - 1]!.focus();
  }, [open, phone, start]);

  const show = (from: 'first' | 'last') => {
    setStart(from);
    setOpen(true);
  };

  const triggerProps: MenuTriggerProps = {
    ref: setTriggerEl,
    id: `${id}-trigger`,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: () => (open ? close(false) : show('first')),
    onKeyDown: (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        show(e.key === 'ArrowDown' ? 'first' : 'last');
      }
    },
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [
      ...(menu.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const focus = (i: number) =>
      items[(i + items.length) % items.length]?.focus();
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focus(at + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focus(at < 0 ? -1 : at - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focus(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focus(-1);
    } else if (
      e.key.length === 1 &&
      /\S/.test(e.key) &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      const char = e.key.toLowerCase();
      const order = [...items.slice(at + 1), ...items.slice(0, at + 1)];
      order
        .find((el) => el.textContent?.trim().toLowerCase().startsWith(char))
        ?.focus();
    }
  };

  const surface = (
    <div
      ref={menu}
      id={menuId}
      role="menu"
      aria-label={label}
      className={cx(
        'ui-menu',
        phone ? 'ui-menu--sheet' : `ui-menu--popover ui-menu--${align}`,
      )}
      style={width && !phone ? { width } : undefined}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );

  return (
    <MenuContext.Provider value={{ close }}>
      <span ref={anchor} className={cx('ui-menu-anchor', className)}>
        {trigger(triggerProps)}
        {open && !phone ? surface : null}
      </span>
      {open && phone ? (
        <BottomSheet title={label} onClose={() => close()}>
          {surface}
        </BottomSheet>
      ) : null}
    </MenuContext.Provider>
  );
};

type ItemProps = {
  children: ReactNode;
  onSelect?: () => void;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
};

export const MenuItem = ({
  children,
  onSelect,
  icon,
  shortcut,
  danger,
  disabled,
}: ItemProps) => {
  const menu = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      className={cx('ui-menu__item', danger && 'ui-menu__item--danger')}
      onClick={() => {
        if (disabled) return;
        menu?.close();
        onSelect?.();
      }}
    >
      {icon ? (
        <span className="ui-menu__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="ui-menu__label">{children}</span>
      {shortcut ? (
        <kbd className="ui-menu__shortcut" aria-hidden="true">
          {shortcut}
        </kbd>
      ) : null}
    </button>
  );
};

type RadioGroupProps<T extends string> = {
  label: string;
  /** Hides the group label, keeping it as the group's name. */
  hideLabel?: boolean;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  value: T | null;
  onChange: (value: T) => void;
};

/** A set of menu items with one marked current by a check. */
export const MenuRadioGroup = <T extends string>({
  label,
  hideLabel,
  options,
  value,
  onChange,
}: RadioGroupProps<T>) => {
  const menu = useContext(MenuContext);
  return (
    <div role="group" aria-label={label}>
      {hideLabel ? null : (
        <div className="ui-menu__group-label" aria-hidden="true">
          {label}
        </div>
      )}
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            aria-disabled={option.disabled || undefined}
            tabIndex={-1}
            className="ui-menu__item"
            onClick={() => {
              if (option.disabled) return;
              menu?.close();
              onChange(option.value);
            }}
          >
            <span className="ui-menu__check" aria-hidden="true">
              {checked ? <Glyph name="check" size={16} /> : null}
            </span>
            <span className="ui-menu__label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export const MenuGroup = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div role="group" aria-label={label}>
    <div className="ui-menu__group-label" aria-hidden="true">
      {label}
    </div>
    {children}
  </div>
);

export const MenuSeparator = () => (
  <div role="separator" className="ui-menu__separator" />
);
