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

export const AreaChip = () => {
  const { area, setArea } = useArea();
  return (
    <ChipSelect
      label="Area"
      title={SHEET_TITLE}
      options={useAreaOptions()}
      value={area}
      onChange={setArea}
    />
  );
};
