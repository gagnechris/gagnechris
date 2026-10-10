import type { SFSymbol } from 'expo-symbols';
import { openBrowserAsync } from 'expo-web-browser';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Screen } from './Screen';

export const ADMIN_WEB = 'https://admin.gagnechris.com';

/** An Admin tab whose screens aren't in the app yet: opens it on the web. */
export const OnTheWeb = ({
  icon,
  what,
  path,
}: {
  icon: SFSymbol;
  what: string;
  path: string;
}) => (
  <Screen>
    <EmptyState
      icon={icon}
      title={`${what} on iPhone is coming`}
      body={`Until then, manage ${what.toLowerCase()} on admin.gagnechris.com.`}
    />
    <Button
      title="Open on the web"
      variant="secondary"
      onPress={() => void openBrowserAsync(`${ADMIN_WEB}${path}`)}
    />
  </Screen>
);
