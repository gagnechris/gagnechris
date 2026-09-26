import { Outlet } from 'react-router-dom';
import RouteTracker from './RouteTracker';

export default function AppWithTracking() {
  return (
    <RouteTracker>
      <Outlet />
    </RouteTracker>
  );
}