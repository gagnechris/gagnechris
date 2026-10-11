import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../utils/analytics';

interface RouteTrackerProps {
  children: React.ReactNode;
}

export default function RouteTracker({ children }: RouteTrackerProps) {
  const location = useLocation();

  // A layout effect runs after the page's own (usePageHead has set the title)
  // and before any page's mount effects, so its events follow the page_view.
  useLayoutEffect(() => {
    trackPageView(location.pathname);
  }, [location]);

  return <>{children}</>;
}
