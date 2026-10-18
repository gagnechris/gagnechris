import { tokens } from '@gagnechris/tokens';
import type { ReactNode } from 'react';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { PUBLIC_SITE_ORIGIN, resolveMarkdownUrl } from '../markdown/links';
import { color, font, MIN_TARGET } from '../theme';
import { Chip } from '../ui/Chip';
import { confirmAction } from '../ui/confirm';
import { Icon } from '../ui/Icon';
import { ListRow } from '../ui/ListRow';
import { Section } from '../ui/Section';
import { TextButton } from '../ui/TextButton';

/** A page sheet with Done, holding an editor's secondary fields. */
export const DetailsSheet = ({
  visible,
  onClose,
  title = 'Details',
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) => (
  <Modal
    visible={visible}
    animationType="slide"
    presentationStyle="pageSheet"
    onRequestClose={onClose}
  >
    <View style={styles.sheet}>
      <View style={styles.bar}>
        <Text
          style={styles.heading}
          accessibilityRole="header"
          numberOfLines={1}
        >
          {title}
        </Text>
        <TextButton strong align="end" onPress={onClose}>
          Done
        </TextButton>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  </Modal>
);

export const FieldLabel = ({ children }: { children: string }) => (
  <Text style={styles.label}>{children}</Text>
);

export const FieldHint = ({ children }: { children: ReactNode }) => (
  <Text style={styles.hint}>{children}</Text>
);

export const FieldError = ({ children }: { children?: string }) =>
  children ? (
    <Text style={styles.error} accessibilityRole="alert">
      {children}
    </Text>
  ) : null;

/** A labelled text field; `prefix` sits before the input, as for a slug. */
export const TextField = ({
  label,
  prefix,
  multiline,
  error,
  ...input
}: TextInputProps & {
  label: string;
  prefix?: string;
  error?: string;
}) => {
  const field = (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={color.muted}
      multiline={multiline}
      scrollEnabled={multiline ? false : undefined}
      {...input}
      style={[
        styles.input,
        multiline && styles.multiline,
        prefix ? styles.prefixedInput : null,
        error ? styles.inputError : null,
      ]}
    />
  );
  return (
    <>
      <FieldLabel>{label}</FieldLabel>
      {prefix ? (
        <View style={styles.prefixed}>
          <Text style={styles.prefix}>{prefix}</Text>
          {field}
        </View>
      ) : (
        field
      )}
      <FieldError>{error}</FieldError>
    </>
  );
};

/** Chips that remove (after a confirm), plus an add chip. */
export const ChipsField = ({
  label,
  noun,
  values,
  onChange,
}: {
  label: string;
  noun: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
}) => {
  const add = () =>
    Alert.prompt(`Add a ${noun}`, undefined, (value) => {
      const item = value?.trim().replace(/,/g, '');
      if (!item || values.includes(item)) return;
      onChange([...values, item]);
    });
  const remove = async (item: string) => {
    if (await confirmAction(`Remove “${item}”?`, '', 'Remove')) {
      onChange(values.filter((v) => v !== item));
    }
  };
  return (
    <>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.chips}>
        {values.map((item) => (
          <Chip
            key={item}
            accessibilityLabel={`${label}: ${item}`}
            removeLabel={`Remove ${noun} ${item}`}
            onRemove={() => void remove(item)}
          >
            {item}
          </Chip>
        ))}
        <Chip tone="add" accessibilityLabel={`Add ${noun}`} onPress={add}>
          {`+ ${noun}`}
        </Chip>
      </View>
    </>
  );
};

/** A site image path with Choose a photo and Remove. */
export const ImageField = ({
  label,
  path,
  uploading,
  onChoose,
  onRemove,
  hint,
  error,
}: {
  label: string;
  path: string;
  uploading: boolean;
  onChoose: () => void;
  onRemove: () => void;
  hint?: string;
  error?: string;
}) => {
  const uri = path ? resolveMarkdownUrl(path, PUBLIC_SITE_ORIGIN) : null;
  return (
    <>
      <FieldLabel>{label}</FieldLabel>
      {uri ? (
        <Image
          accessibilityLabel={label}
          accessibilityIgnoresInvertColors
          source={{ uri }}
          resizeMode="cover"
          style={styles.image}
        />
      ) : null}
      <Section>
        <ListRow
          title={
            uploading
              ? 'Uploading photo…'
              : uri
                ? 'Choose another photo'
                : 'Choose a photo'
          }
          leading={<Icon name="photo" color={color.accent} />}
          onPress={uploading ? undefined : onChoose}
        />
        {uri ? (
          <ListRow
            title={`Remove ${label.toLowerCase()}`}
            destructive
            divider
            onPress={onRemove}
          />
        ) : null}
      </Section>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      <FieldError>{error}</FieldError>
    </>
  );
};

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.background },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  heading: {
    ...font.semibold,
    fontSize: tokens.text.body,
    color: color.ink,
    flexShrink: 1,
  },
  content: {
    padding: tokens.space[4],
    paddingBottom: tokens.space[12],
    gap: tokens.space[2],
  },
  label: {
    ...font.semibold,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
    paddingTop: tokens.space[3],
  },
  hint: { ...font.regular, fontSize: tokens.text.caption, color: color.muted },
  error: { ...font.medium, fontSize: tokens.text.caption, color: color.alert },
  input: {
    ...font.regular,
    fontSize: tokens.text.body,
    color: color.ink,
    backgroundColor: color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
    minHeight: MIN_TARGET,
  },
  inputError: { borderColor: color.alert },
  multiline: { minHeight: MIN_TARGET * 2, textAlignVertical: 'top' },
  prefixed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[1],
  },
  prefix: { ...font.regular, fontSize: tokens.text.body, color: color.muted },
  prefixedInput: { flex: 1 },
  // Room for each chip's slop, so every chip keeps a 44 pt target.
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: tokens.space[4],
    columnGap: tokens.space[2],
    paddingVertical: tokens.space[2],
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: tokens.radius.md,
    backgroundColor: color.fill,
  },
});
