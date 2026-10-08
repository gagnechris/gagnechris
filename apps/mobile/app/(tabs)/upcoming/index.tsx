import {
  NOTEBOOK_AREA_FILTERS,
  NOTEBOOK_AREA_LABELS,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { StyleSheet, Text } from 'react-native';
import { useArea } from '../../../src/area';
import { color, font } from '../../../src/theme';
import { EmptyState } from '../../../src/ui/EmptyState';
import { Screen } from '../../../src/ui/Screen';
import { SegmentedControl } from '../../../src/ui/SegmentedControl';

const UpcomingScreen = () => {
  const { area, setArea } = useArea();
  return (
    <Screen>
      <Text style={styles.subtitle}>Hidden until their day</Text>
      <SegmentedControl
        label="Area"
        options={NOTEBOOK_AREA_FILTERS}
        labels={NOTEBOOK_AREA_LABELS}
        value={area}
        onChange={setArea}
      />
      <EmptyState
        icon="calendar"
        title="Nothing scheduled"
        body="Add @mon, @oct 12 or @someday to a task to see it here."
      />
    </Screen>
  );
};

export default UpcomingScreen;

const styles = StyleSheet.create({
  subtitle: {
    ...font.regular,
    fontSize: tokens.text.lg,
    color: color.inkSoft,
  },
});
