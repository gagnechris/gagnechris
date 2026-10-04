import { Outlet, useLocation } from 'react-router-dom';
import { siteNavCurrent } from '@gagnechris/shared/site-chrome';
import { coldLoadedNotFound } from '../prerender/notFoundPrerender';
import RouteTracker from './RouteTracker';
import { SiteFooter, SiteHeader } from './SiteChrome';

export default function AppWithTracking() {
  const { pathname } = useLocation();
  // The one 404.html marks no section current, whatever path it answers.
  const current = coldLoadedNotFound(pathname)
    ? null
    : siteNavCurrent(pathname);
  return (
    <RouteTracker>
      <SiteHeader current={current} />
      <Outlet />
      <SiteFooter />
    </RouteTracker>
  );
}
