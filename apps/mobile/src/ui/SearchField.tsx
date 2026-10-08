import { tokens } from '@gagnechris/tokens';
import { StyleSheet, TextInput, View } from 'react-native';
import { color, font, MIN_TARGET } from '../theme';
import { Icon } from './Icon';

export const SearchField = ({
  placeholder,
  value,
  onChangeText,
}: {
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
}) => (
  <View style={styles.field}>
    <Icon name="magnifyingglass" size={17} color={color.muted} />
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor={color.muted}
      accessibilityLabel={placeholder}
      value={value}
      onChangeText={onChangeText}
      returnKeyType="search"
      autoCorrect={false}
      clearButtonMode="while-editing"
    />
  </View>
);

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    minHeight: MIN_TARGET,
    paddingHorizontal: tokens.space[3],
    borderRadius: tokens.radius.md + 2,
    backgroundColor: color.fill,
  },
  input: {
    flex: 1,
    minHeight: MIN_TARGET,
    ...font.regular,
    fontSize: tokens.text.body,
    color: color.ink,
  },
});
