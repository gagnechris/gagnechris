import { tokens } from '@gagnechris/tokens';
import { StyleSheet, Text, View } from 'react-native';
import { MarkdownView } from '../../markdown/MarkdownView';
import { color, font } from '../../theme';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { LiveMarkdownInput } from '../../ui/LiveMarkdownInput';

type Props = {
  description: string;
  onChange: (description: string) => void;
  preview: boolean;
  onTogglePreview: () => void;
};

/** The markdown description, with a Preview toggle. */
export const TaskDescription = ({
  description,
  onChange,
  preview,
  onTogglePreview,
}: Props) => (
  <>
    <View style={styles.header}>
      <Text style={styles.label} accessibilityRole="header">
        DESCRIPTION
      </Text>
      <IconButton
        size="lg"
        label="Preview"
        pressed={preview}
        onPress={onTogglePreview}
      >
        <Icon
          name={preview ? 'eye.fill' : 'eye'}
          size={18}
          color={preview ? color.accent : color.inkSoft}
        />
      </IconButton>
    </View>
    {preview ? (
      <View style={styles.description}>
        <MarkdownView markdown={description} />
      </View>
    ) : (
      // The native text view ignores padding, so the card around it pads.
      <View style={styles.description}>
        <LiveMarkdownInput
          variant="note"
          accessibilityLabel="Description"
          placeholder="Notes, links, markdown"
          value={description}
          onChangeText={onChange}
        />
      </View>
    )}
  </>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: tokens.space[4],
    marginBottom: -tokens.space[3],
  },
  label: {
    ...font.semibold,
    fontSize: tokens.text.caption,
    letterSpacing: 0.6,
    color: color.inkSoft,
  },
  description: {
    backgroundColor: color.surface,
    borderRadius: tokens.radius.lg - 4,
    padding: tokens.space[4],
    minHeight: 120,
  },
});
