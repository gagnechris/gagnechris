import { Outlet, useLocation } from 'react-router-dom';
import { PublicLinkContext } from '@gagnechris/public-ui';
import { siteNavCurrent } from '@gagnechris/shared/site-chrome';
import { useFooterYear } from '../prerender/footerYear';
import { coldLoadedNotFound } from '../prerender/notFoundPrerender';
import RouteTracker from './RouteTracker';
import { SiteFooter, SiteHeader } from './SiteChrome';
import SiteLink from './SiteLink';

export default function AppWithTracking() {
  const { pathname } = useLocation();
  const footerYear = useFooterYear();
  // The one 404.html marks no section current, whatever path it answers.
  const current = coldLoadedNotFound(pathname)
    ? null
    : siteNavCurrent(pathname);
  return (
    <PublicLinkContext.Provider value={SiteLink}>
      <RouteTracker>
        <SiteHeader current={current} />
        <Outlet />
        <SiteFooter year={footerYear} />
      </RouteTracker>
    </PublicLinkContext.Provider>
  );
}
