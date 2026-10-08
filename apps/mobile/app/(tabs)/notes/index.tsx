import { useState } from 'react';
import { EmptyState } from '../../../src/ui/EmptyState';
import { Screen } from '../../../src/ui/Screen';
import { SegmentedControl } from '../../../src/ui/SegmentedControl';

const NOTE_KINDS = ['all', 'daily', 'pages'] as const;
type NoteKind = (typeof NOTE_KINDS)[number];
const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  all: 'All',
  daily: 'Daily',
  pages: 'Pages',
};

const NotesScreen = () => {
  const [kind, setKind] = useState<NoteKind>('all');
  return (
    <Screen>
      <SegmentedControl
        label="Note type"
        options={NOTE_KINDS}
        labels={NOTE_KIND_LABELS}
        value={kind}
        onChange={setKind}
      />
      <EmptyState
        icon="doc.text"
        title="No notes yet"
        body="Daily notes and pages you write show here, pinned ones first."
      />
    </Screen>
  );
};

export default NotesScreen;
