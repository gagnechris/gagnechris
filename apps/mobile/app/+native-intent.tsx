import { adminLinkRoute } from '../src/adminLinks';

// Admin and Notebook links share paths like /home, so the host picks the space.
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  return adminLinkRoute(path) ?? path;
}
