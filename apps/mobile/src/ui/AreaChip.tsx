import { useCallback, useMemo } from 'react';
import { useArea } from '../area';
import { ChipSelect, pickFromSheet } from './Chip';

const SHEET_TITLE = 'Show notes and tasks from';

const useAreaOptions = () => {
  const { areas } = useArea();
  return useMemo(
    () => areas.map((a) => ({ value: a.id, label: a.name })),
    [areas],
  );
};

export function useAreaPicker(): () => void {
  const { area, setArea } = useArea();
  const options = useAreaOptions();
  return useCallback(
    () =>
      pickFromSheet({
        title: SHEET_TITLE,
        options,
        value: area,
        onChange: setArea,
      }),
    [area, options, setArea],
  );
}

const ALL = '';

type AreaChipProps = {
  /** Adds an "All areas" choice; picking an area turns it off. */
  all?: { selected: boolean; onChange: (all: boolean) => void };
  /** Runs after an area is picked. */
  onPick?: (area: string) => void;
  /** Shows this area instead of the current one. */
  value?: string;
};

export const AreaChip = ({ all, onPick, value }: AreaChipProps) => {
  const { area, setArea } = useArea();
  const options = useAreaOptions();
  return (
    <ChipSelect
      label="Area"
      title={SHEET_TITLE}
      options={all ? [{ value: ALL, label: 'All areas' }, ...options] : options}
      value={all?.selected ? ALL : (value ?? area)}
      onChange={(next) => {
        if (next === ALL) {
          all?.onChange(true);
          return;
        }
        setArea(next);
        all?.onChange(false);
        onPick?.(next);
      }}
    />
  );
};
