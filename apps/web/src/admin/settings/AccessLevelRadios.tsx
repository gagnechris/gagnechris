import { ACCESS_LEVEL_LABELS, type AccessLevel } from '@gagnechris/shared';
import { LEVEL_DESCRIPTIONS, LEVEL_ORDER } from '@gagnechris/app-core';
import { RadioCardGroup } from '@gagnechris/ui';

type Props = {
  value: AccessLevel | null;
  onChange: (level: AccessLevel) => void;
  isDisabled?: (level: AccessLevel) => boolean;
  /** Disables the whole group. */
  disabled?: boolean;
};

export function AccessLevelRadios({
  value,
  onChange,
  isDisabled = () => false,
  disabled = false,
}: Props) {
  return (
    <div className="users-levels-field">
      <span className="users-levels-field__label" aria-hidden="true">
        Access
      </span>
      <RadioCardGroup
        label="Access"
        value={value}
        onChange={onChange}
        options={LEVEL_ORDER.map((level) => ({
          value: level,
          title: ACCESS_LEVEL_LABELS[level],
          description: LEVEL_DESCRIPTIONS[level],
          disabled: disabled || isDisabled(level),
        }))}
      />
    </div>
  );
}
