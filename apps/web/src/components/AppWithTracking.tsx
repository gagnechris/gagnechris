import { Outlet, useLocation } from 'react-router-dom';
import { siteNavCurrent } from '@gagnechris/shared/site-chrome';
import RouteTracker from './RouteTracker';
import { SiteFooter, SiteHeader } from './SiteChrome';

export default function AppWithTracking() {
  const { pathname } = useLocation();
  return (
    <RouteTracker>
      <SiteHeader current={siteNavCurrent(pathname)} />
      <Outlet />
      <SiteFooter />
    </RouteTracker>
  );
}
