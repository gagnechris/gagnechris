import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SiteMenu } from '@gagnechris/public-ui';
import type { SiteNavHref } from '@gagnechris/shared/site-chrome';

/** The phone menu's state, focus trap and Escape around the published markup. */
const AppSiteMenu = ({ current }: { current: SiteNavHref | null }) => {
  const { pathname } = useLocation();
  // Keyed to the path, so navigating anywhere (Back included) closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const menuRef = useRef<HTMLDetailsElement>(null);
  const buttonRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const menu = menuRef.current;
    const button = buttonRef.current;
    // Hidden above the phone breakpoint: nothing to trap.
    if (!open || !menu || !button?.getClientRects().length) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpenOn(null);
        button.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const stops = [button, ...menu.querySelectorAll<HTMLElement>('nav a')];
      const at = stops.indexOf(document.activeElement as HTMLElement);
      const last = stops.length - 1;
      event.preventDefault();
      if (event.shiftKey) stops[at <= 0 ? last : at - 1]!.focus();
      else stops[at === -1 || at === last ? 0 : at + 1]!.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <SiteMenu
      current={current}
      open={open}
      onToggle={() => setOpenOn(open ? null : pathname)}
      onNavigate={() => setOpenOn(null)}
      menuRef={menuRef}
      buttonRef={buttonRef}
    />
  );
};

export default AppSiteMenu;
