import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../utils/analytics';

interface RouteTrackerProps {
  children: React.ReactNode;
}

export default function RouteTracker({ children }: RouteTrackerProps) {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location]);

  return <>{children}</>;
}