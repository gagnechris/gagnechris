/** @jsxRuntime automatic */
import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { BottomSheet } from './BottomSheet.js';
import { Button } from './Button.js';
import { cx } from './cx.js';
import { Glyph } from './Glyph.js';
import { IconButton } from './IconButton.js';
import { Scrim } from './Scrim.js';
import { useModalDialog } from './useModalDialog.js';
import { usePhone } from './usePhone.js';

type Common = {
  title: string;
  /** The dialog's name, when it should say more than the title. */
  label?: string;
  onClose: () => void;
  children: ReactNode;
  /** The primary action, shown after Cancel in the footer (or as Done in a sheet). */
  actions?: ReactNode;
  /** Label for the footer's cancel button; `false` hides it. */
  cancelLabel?: string | false;
  /** Starts focus somewhere other than the first field. */
  initialFocus?: RefObject<HTMLElement | null>;
};

type SurfaceProps = Common & {
  kind: 'dialog' | 'drawer';
  size?: 'sm' | 'md' | 'lg';
  hideClose?: boolean;
};

const Surface = ({
  kind,
  title,
  label,
  onClose,
  children,
  actions,
  cancelLabel = 'Cancel',
  initialFocus,
  size = 'md',
  hideClose,
}: SurfaceProps) => {
  const titleId = useId();
  const body = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalDialog<HTMLElement>({
    label: label ?? title,
    onClose,
    initialFocus: initialFocus ?? body,
    lockScroll: true,
  });
  return (
    <div className={cx('ui-overlay', `ui-overlay--${kind}`)}>
      <Scrim onClick={onClose} />
      <section
        {...dialogProps}
        aria-label={label}
        aria-labelledby={label ? undefined : titleId}
        className={cx(`ui-${kind}`, kind === 'dialog' && `ui-dialog--${size}`)}
      >
        <header className="ui-dialog__head">
          <h2 id={titleId} className="ui-dialog__title">
            {title}
          </h2>
          {hideClose ? null : (
            <IconButton label="Close" onClick={onClose}>
              <Glyph name="close" />
            </IconButton>
          )}
        </header>
        <div ref={body} className="ui-dialog__body">
          {children}
        </div>
        {actions ? (
          <footer className="ui-dialog__foot">
            {cancelLabel === false ? null : (
              <Button onClick={onClose}>{cancelLabel}</Button>
            )}
            {actions}
          </footer>
        ) : null}
      </section>
    </div>
  );
};

type DialogProps = Common & {
  size?: 'sm' | 'md' | 'lg';
  hideClose?: boolean;
};

/**
 * A centred modal: focus moves to the first field and stays inside; Escape,
 * the close button and the scrim close it. Under 768px it opens as a
 * BottomSheet.
 */
export const Dialog = (props: DialogProps) => {
  const phone = usePhone();
  if (phone) {
    return (
      <BottomSheet
        title={props.title}
        label={props.label}
        onClose={props.onClose}
        done={props.actions}
        closeLabel={props.cancelLabel || undefined}
        initialFocus={props.initialFocus}
      >
        {props.children}
      </BottomSheet>
    );
  }
  return <Surface kind="dialog" {...props} />;
};

/** A full-height panel from the right edge; a BottomSheet under 768px. */
export const Drawer = (props: Common) => {
  const phone = usePhone();
  if (phone) {
    return (
      <BottomSheet
        title={props.title}
        label={props.label}
        onClose={props.onClose}
        done={props.actions}
        closeLabel={props.cancelLabel || undefined}
        initialFocus={props.initialFocus}
      >
        {props.children}
      </BottomSheet>
    );
  }
  return <Surface kind="drawer" {...props} />;
};
