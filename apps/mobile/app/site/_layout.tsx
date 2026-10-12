import { useSession } from '../../src/session';
import { SpaceTabs } from '../../src/ui/SpaceTabs';

/** The public site, open to everyone; signed in, its last tab lists your apps. */
const SiteLayout = () => {
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  return (
    <SpaceTabs
      tabs={[
        { name: 'home', title: 'Home', icon: 'house' },
        { name: 'posts', title: 'Posts', icon: 'doc.text' },
        { name: 'resume', title: 'Resume', icon: 'person.text.rectangle' },
        signedIn
          ? { name: 'account', title: 'Apps', icon: 'square.grid.2x2' }
          : { name: 'account', title: 'Sign in', icon: 'person.crop.circle' },
      ]}
    />
  );
};

export default SiteLayout;
