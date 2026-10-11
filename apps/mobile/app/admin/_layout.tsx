import { useSession } from '../../src/session';
import { canManageUsers, useRememberSpace } from '../../src/space';
import { SpaceTabs } from '../../src/ui/SpaceTabs';

const AdminTabs = () => {
  useRememberSpace('admin');
  const { user } = useSession();
  return (
    <SpaceTabs
      tabs={[
        { name: 'posts', title: 'Posts', icon: 'square.and.pencil' },
        { name: 'pages', title: 'Pages', icon: 'house' },
        { name: 'projects', title: 'Projects', icon: 'square.grid.2x2' },
        {
          name: 'users',
          title: 'Users',
          icon: 'person.2',
          hidden: !canManageUsers(user?.groups ?? []),
        },
        { name: 'more', title: 'More', icon: 'ellipsis' },
      ]}
    />
  );
};

export default AdminTabs;
