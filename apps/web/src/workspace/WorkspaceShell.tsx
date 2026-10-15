import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { initials, SITE_AUTHOR_NAME } from '@gagnechris/shared';
import { clearPendingFlushes, hasPendingFlushes } from '@gagnechris/app-core';
import {
  accessLevel,
  APP_GROUP,
  APP_TITLE,
  appHost,
  appOrigin,
  type WorkspaceAppName,
} from './access';
import { isDevProdApiTarget } from './api/apiTarget';
import AccessGate from './auth/AccessGate';
import RequireAuth from './auth/RequireAuth';
import {
  canAddPasskey,
  openAddPasskey,
  signOutUser,
  type AuthUser,
} from './auth/session';
import { WorkspaceQueryProvider } from './query/WorkspaceQueryProvider';
import { useModalDialog } from '@gagnechris/ui';
import { visibleNavSections } from './navSections';
import { PanelCollapseButton, PanelExpandEdge } from './ui/PanelEdge';
import { ResizeHandle } from './ui/ResizeHandle';
import ShellIcon, { type ShellIconName } from './ui/ShellIcon';
import { usePanelEdgeFocus } from './ui/usePanelEdgeFocus';
import { useStoredWidth } from './ui/useStoredWidth';
import { noteColumnRoom } from './ui/noteColumn';
import { useVisualViewportCssVars } from './useVisualViewportCssVars';
import { WorkspaceSearchContext } from './workspaceSearch';
import {
  isSidebarShortcut,
  readSidebarOpen,
  writeSidebarOpen,
} from './workspaceSidebar';
import '../kit/kit.css';
import './workspace.css';

export type ShellNavItem = {
  to: string;
  label: string;
  /** Phone tab bar label when `label` is too long for it. */
  tabLabel?: string;
  icon: ShellIconName;
  end?: boolean;
  /** Screens that open from this item: it stays current there, and search finds them. */
  childPages?: { to: string; label: string }[];
  /** Hidden unless the user is in this Cognito group. */
  group?: string;
  count?: string;
};

export type ShellNavSection = {
  label: string;
  items: ShellNavItem[];
};

type WorkspaceFrameProps = {
  app: WorkspaceAppName;
  user: AuthUser;
  sections: ShellNavSection[];
  /** Above the nav, and in the phone More sheet. */
  sidebarTop?: ReactNode;
  /** Below the nav, in the desktop sidebar only. */
  sidebarBottom?: ReactNode;
  /** Icon rail instead of the full sidebar, for focused editors. */
  rail?: boolean;
  /** The sidebar's edge and ⌘\ hide and show it. */
  collapsible?: boolean;
  renderSearch: (close: () => void) => ReactNode;
  /** Defaults to the route outlet. */
  children?: ReactNode;
};

const PHONE_TABS = 4;

function navItemClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? 'workspace-nav__item workspace-nav__item--active'
    : 'workspace-nav__item';
}

function ExternalLink({
  href,
  icon,
  label,
  detail,
}: {
  href: string;
  icon: ShellIconName;
  label: string;
  detail?: string;
}) {
  return (
    <a
      className="workspace-nav__item"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
    >
      <ShellIcon name={icon} />
      <span className="workspace-nav__label">
        {label}
        {detail ? (
          <span className="workspace-nav__detail">{detail}</span>
        ) : null}
        <span className="workspace-visually-hidden"> (opens in a new tab)</span>
      </span>
      <span className="workspace-nav__trail" aria-hidden="true">
        <ShellIcon name="external" size={14} />
      </span>
    </a>
  );
}

const SIDEBAR_MIN = 192;
const SIDEBAR_MAX = 400;
const SIDEBAR_ID = 'workspace-sidebar';

/** Sidebar, phone tab bar and ⌘K for one signed-in app. */
export function WorkspaceFrame({
  app,
  user,
  sections,
  sidebarTop,
  sidebarBottom,
  rail = false,
  collapsible = false,
  renderSearch,
  children,
}: WorkspaceFrameProps) {
  const title = APP_TITLE[app];
  const prodApi = isDevProdApiTarget();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  // Tied to the location so any navigation closes the sheet.
  const [moreOpenAt, setMoreOpenAt] = useState<string | null>(null);
  const moreOpen = moreOpenAt === location.key;
  useVisualViewportCssVars();
  const sidebarRef = useRef<HTMLElement>(null);
  const [sidebarWidth, setSidebarWidth] = useStoredWidth(
    `gagnechris.${app}.sidebarWidth`,
    SIDEBAR_MIN,
    SIDEBAR_MAX,
  );
  const [sidebarOpenState, setSidebarOpenState] = useState(() =>
    readSidebarOpen(app),
  );
  const sidebarOpen = !collapsible || sidebarOpenState;
  const {
    collapseRef: sidebarCollapseRef,
    expandRef: sidebarExpandRef,
    handOff: sidebarHandOff,
  } = usePanelEdgeFocus(sidebarOpen);
  const setSidebarOpen = useCallback(
    (open: boolean, fromEdge?: { byKeyboard: boolean }) => {
      writeSidebarOpen(app, open);
      setSidebarOpenState(open);
      const active = document.activeElement;
      if (fromEdge) {
        sidebarHandOff(fromEdge.byKeyboard);
      } else if (
        open
          ? active === sidebarExpandRef.current
          : sidebarRef.current?.contains(active)
      ) {
        sidebarHandOff();
      }
    },
    [app, sidebarExpandRef, sidebarHandOff],
  );

  // Editors that already unmounted can still be retrying a save.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingFlushes()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        // The palette would open underneath another dialog and take its keys.
        if (document.querySelector('[aria-modal="true"]')) return;
        e.preventDefault();
        setMoreOpenAt(null);
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!collapsible) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isSidebarShortcut(e)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      setSidebarOpen(!sidebarOpen);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsible, sidebarOpen, setSidebarOpen]);

  const sidebarEdgeProps = {
    label: 'Sidebar',
    noun: 'sidebar',
    controls: SIDEBAR_ID,
    side: 'left',
    shortcut: '⌘\\',
    keyShortcuts: 'Meta+\\ Control+\\',
  } as const;

  const visibleSections = visibleNavSections(sections, user.groups);
  const phoneOverflow = new Set(
    visibleSections.flatMap((s) => s.items).slice(PHONE_TABS),
  );

  const otherApp: WorkspaceAppName = app === 'admin' ? 'notebook' : 'admin';
  const openSearch = () => {
    setMoreOpenAt(null);
    setSearchOpen(true);
  };

  const searchButton = (
    <button
      type="button"
      className="workspace-search-button"
      onClick={openSearch}
      title="Search everything (⌘K)"
    >
      <ShellIcon name="search" />
      <span className="workspace-search-button__label">Search everything</span>
      <kbd className="workspace-kbd" aria-hidden="true">
        ⌘K
      </kbd>
    </button>
  );

  const yourApps = (
    <nav className="workspace-apps" aria-label="Your apps">
      <span className="workspace-nav__heading">Your apps</span>
      {user.groups.includes(APP_GROUP[otherApp]) ? (
        <ExternalLink
          href={`${appOrigin(otherApp)}/`}
          icon={otherApp === 'notebook' ? 'notebook' : 'posts'}
          label={APP_TITLE[otherApp]}
        />
      ) : null}
      <ExternalLink
        href={`${appOrigin('public')}/`}
        icon="globe"
        label="Public site"
      />
    </nav>
  );

  const account = (
    <div className="workspace-account">
      <span className="workspace-account__avatar" aria-hidden="true">
        {initials(user.label)}
      </span>
      <span className="workspace-account__who">
        <span className="workspace-account__name">{user.label}</span>
        <span className="workspace-account__level">
          {accessLevel(user.groups)}
        </span>
      </span>
      {canAddPasskey() ? (
        <button
          type="button"
          className="workspace-icon-button"
          aria-label="Add a passkey"
          title="Add a passkey"
          onClick={openAddPasskey}
        >
          <ShellIcon name="passkey" />
          <span className="workspace-icon-button__label">Add a passkey</span>
        </button>
      ) : null}
      <button
        type="button"
        className="workspace-icon-button"
        aria-label={`Sign out of ${title}`}
        title={`Sign out of ${title}`}
        onClick={() => {
          clearPendingFlushes();
          void signOutUser();
        }}
      >
        <ShellIcon name="signOut" />
        <span className="workspace-icon-button__label">Sign out</span>
      </button>
    </div>
  );

  return (
    <div
      className={[
        'workspace-shell workspace',
        rail ? 'workspace--rail' : '',
        sidebarOpen ? '' : 'workspace--sidebar-closed',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        sidebarWidth === null
          ? undefined
          : ({
              '--workspace-sidebar-width': `${sidebarWidth}px`,
            } as CSSProperties)
      }
    >
      <title>{`${title} - ${SITE_AUTHOR_NAME}`}</title>
      <meta name="robots" content="noindex, nofollow" />
      {prodApi ? (
        <div className="workspace-prod-banner" role="status" aria-live="polite">
          PRODUCTION API — edits, autosave, and publish hit the live site
        </div>
      ) : null}
      <div className="workspace__body">
        <aside
          className="workspace-sidebar"
          id={collapsible ? SIDEBAR_ID : undefined}
          ref={sidebarRef}
        >
          <div className="workspace-brand workspace-desktop">
            <span className="workspace-brand__mark" aria-hidden="true">
              CG
            </span>
            <span className="workspace-brand__text">
              <span className="workspace-brand__title">{title}</span>
              <span className="workspace-brand__host">{appHost(app)}</span>
            </span>
          </div>
          <div className="workspace-desktop">{searchButton}</div>
          {sidebarTop ? (
            <div className="workspace-desktop workspace-sidebar__top">
              {sidebarTop}
            </div>
          ) : null}
          <nav className="workspace-nav" aria-label={title}>
            {visibleSections.map((section) => (
              <div key={section.label} className="workspace-nav__section">
                <span className="workspace-nav__heading">{section.label}</span>
                {section.items.map((item) => {
                  const overflow = phoneOverflow.has(item);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => {
                        const active =
                          isActive ||
                          (item.childPages ?? []).some(
                            ({ to: path }) =>
                              location.pathname === path ||
                              location.pathname.startsWith(`${path}/`),
                          );
                        return overflow
                          ? `${navItemClass({ isActive: active })} workspace-nav__item--overflow`
                          : navItemClass({ isActive: active });
                      }}
                      title={item.label}
                      aria-label={
                        item.count
                          ? `${item.label}, ${item.count} open`
                          : undefined
                      }
                    >
                      <ShellIcon name={item.icon} />
                      <span className="workspace-nav__label">
                        {item.tabLabel ? (
                          <>
                            <span className="workspace-nav__full">
                              {item.label}
                            </span>
                            <span
                              className="workspace-nav__short"
                              aria-hidden="true"
                            >
                              {item.tabLabel}
                            </span>
                          </>
                        ) : (
                          item.label
                        )}
                      </span>
                      {item.count ? (
                        <span
                          className="workspace-nav__count"
                          aria-hidden="true"
                        >
                          {item.count}
                        </span>
                      ) : null}
                    </NavLink>
                  );
                })}
              </div>
            ))}
            <button
              type="button"
              className="workspace-nav__item workspace-nav__more"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpenAt(moreOpen ? null : location.key)}
            >
              <ShellIcon name="more" />
              <span className="workspace-nav__label">More</span>
            </button>
          </nav>
          {sidebarBottom ? (
            <div className="workspace-desktop">{sidebarBottom}</div>
          ) : null}
          <div className="workspace-sidebar__footer workspace-desktop">
            {yourApps}
            {account}
          </div>
          {rail ? null : (
            <ResizeHandle
              label="Resize sidebar"
              className="workspace-sidebar__resize"
              target={sidebarRef}
              width={sidebarWidth}
              min={SIDEBAR_MIN}
              max={SIDEBAR_MAX}
              edge="right"
              onChange={setSidebarWidth}
              onCollapse={
                collapsible
                  ? () => setSidebarOpen(false, { byKeyboard: false })
                  : undefined
              }
              room={noteColumnRoom}
            />
          )}
          {collapsible && sidebarOpen ? (
            <PanelCollapseButton
              {...sidebarEdgeProps}
              ref={sidebarCollapseRef}
              className="workspace-sidebar__edge"
              onToggle={(byKeyboard) => setSidebarOpen(false, { byKeyboard })}
            />
          ) : null}
        </aside>
        {collapsible && !sidebarOpen ? (
          <PanelExpandEdge
            {...sidebarEdgeProps}
            ref={sidebarExpandRef}
            onToggle={(byKeyboard) => setSidebarOpen(true, { byKeyboard })}
          />
        ) : null}
        <main className="workspace-main">
          <WorkspaceSearchContext.Provider value={openSearch}>
            {children ?? <Outlet />}
          </WorkspaceSearchContext.Provider>
        </main>
      </div>
      {moreOpen ? (
        <MoreSheet onClose={() => setMoreOpenAt(null)}>
          {searchButton}
          {sidebarTop}
          {phoneOverflow.size > 0 ? (
            <nav className="workspace-more__pages" aria-label={`More ${title}`}>
              {[...phoneOverflow].map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={navItemClass}
                >
                  <ShellIcon name={item.icon} />
                  <span className="workspace-nav__label">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          ) : null}
          {yourApps}
          {account}
        </MoreSheet>
      ) : null}
      {searchOpen ? renderSearch(() => setSearchOpen(false)) : null}
    </div>
  );
}

function MoreSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalDialog({
    label: 'More',
    onClose,
    initialFocus: sheet,
  });
  return (
    <div className="workspace-more" {...dialogProps}>
      <button
        type="button"
        className="workspace-more__backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="workspace-more__sheet" ref={sheet}>
        {children}
      </div>
    </div>
  );
}

/** Signed-in chrome shared by the admin and Notebook apps. */
export default function WorkspaceShell({
  app,
  children,
}: {
  app: WorkspaceAppName;
  children: (user: AuthUser) => ReactNode;
}) {
  return (
    <RequireAuth>
      {(user) => (
        <AccessGate app={app} user={user}>
          {(current) => (
            <WorkspaceQueryProvider>{children(current)}</WorkspaceQueryProvider>
          )}
        </AccessGate>
      )}
    </RequireAuth>
  );
}
