import {
  experienceRangeError,
  roleTitle,
  type ExperienceDraft,
} from '@gagnechris/app-core';
import { Switch } from 'react-native';
import { color } from '../theme';
import { confirmAction } from '../ui/confirm';
import { ListRow } from '../ui/ListRow';
import { Section } from '../ui/Section';
import { DetailsSheet, FieldHint, TextField } from './DetailsSheet';

type Props = {
  role: ExperienceDraft | undefined;
  index: number;
  count: number;
  hasSavedDates: boolean;
  onClose: () => void;
  update: (patch: Partial<ExperienceDraft>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
};

const MONTH_INPUT = {
  placeholder: 'YYYY-MM',
  keyboardType: 'numbers-and-punctuation',
  autoCorrect: false,
  maxLength: 7,
} as const;

export const ResumeRoleSheet = ({
  role,
  index,
  count,
  hasSavedDates,
  onClose,
  update,
  onMove,
  onRemove,
}: Props) => {
  if (!role) return null;
  const rangeError = experienceRangeError(role);
  const remove = async () => {
    if (await confirmAction(`Remove “${roleTitle(role)}”?`, '', 'Remove')) {
      onRemove();
    }
  };

  return (
    <DetailsSheet visible onClose={onClose} title={roleTitle(role)}>
      <TextField
        label="Title"
        value={role.title}
        onChangeText={(title) => update({ title })}
      />
      <TextField
        label="Company"
        value={role.company}
        onChangeText={(company) => update({ company })}
      />
      {!role.start && role.company.includes('|') ? (
        <FieldHint>
          Dates are still inside the company name; move them to Start and End.
        </FieldHint>
      ) : null}
      <TextField
        label="Start month"
        value={role.start}
        onChangeText={(start) => update({ start })}
        {...MONTH_INPUT}
      />
      <TextField
        label="End month"
        value={role.present ? '' : role.end}
        editable={Boolean(role.start) && !role.present}
        onChangeText={(end) => update({ end })}
        error={
          rangeError
            ? `${rangeError}. ${
                hasSavedDates
                  ? 'The last saved dates are kept until this is fixed.'
                  : 'Dates for this role are not saved until this is fixed.'
              }`
            : undefined
        }
        {...MONTH_INPUT}
      />
      <Section>
        <ListRow
          title="Present (current role)"
          accessibilityLabel="Present (current role)"
          trailing={
            <Switch
              accessibilityLabel="Present (current role)"
              value={role.present}
              disabled={!role.start}
              trackColor={{ true: color.accent }}
              onValueChange={(present) =>
                update({ present, ...(present ? { end: '' } : {}) })
              }
            />
          }
        />
      </Section>
      <TextField
        label="Note (optional)"
        value={role.note}
        placeholder="For example: contract, concurrent"
        onChangeText={(note) => update({ note })}
      />
      <TextField
        label="Bullets (one per line)"
        value={role.bulletsText}
        multiline
        onChangeText={(bulletsText) => update({ bulletsText })}
      />
      <Section>
        {index > 0 ? (
          <ListRow title="Move up" onPress={() => onMove(index - 1)} />
        ) : null}
        {index < count - 1 ? (
          <ListRow
            title="Move down"
            divider={index > 0}
            onPress={() => onMove(index + 1)}
          />
        ) : null}
        <ListRow
          title="Remove role"
          destructive
          divider={count > 1}
          onPress={() => void remove()}
        />
      </Section>
    </DetailsSheet>
  );
};
