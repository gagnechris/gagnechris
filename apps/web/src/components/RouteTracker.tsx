import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { setAnalyticsEnabledForPath, trackPageView } from '../utils/analytics';

interface RouteTrackerProps {
  children: React.ReactNode;
}

export default function RouteTracker({ children }: RouteTrackerProps) {
  const location = useLocation();

  useEffect(() => {
    setAnalyticsEnabledForPath(location.pathname);
    trackPageView(location.pathname);
  }, [location]);

  return <>{children}</>;
}
