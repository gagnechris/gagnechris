import { useRememberSpace } from '../../src/space';
import { SpaceTabs, type SpaceTab } from '../../src/ui/SpaceTabs';

const TABS: SpaceTab[] = [
  { name: 'today', title: 'Today', icon: 'sun.max' },
  { name: 'upcoming', title: 'Upcoming', icon: 'calendar' },
  { name: 'notes', title: 'Notes', icon: 'doc.text' },
  { name: 'tasks', title: 'Tasks', icon: 'checkmark.square' },
  { name: 'more', title: 'More', icon: 'ellipsis' },
];

const NotebookTabs = () => {
  useRememberSpace('notebook');
  return <SpaceTabs tabs={TABS} />;
};

export default NotebookTabs;
