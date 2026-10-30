import { ChipSelect } from '@gagnechris/ui';
import { useOutletContext } from 'react-router-dom';
import type { NotebookOutletContext } from './NotebookLayout';

const ALL = '';

type Props = {
  /** Adds an "All areas" choice; picking an area turns it off. */
  all?: { selected: boolean; onChange: (all: boolean) => void };
};

export default function NotebookAreaSwitch({ all }: Props) {
  const { area, areas, setArea } = useOutletContext<NotebookOutletContext>();
  const options = areas.map((a) => ({ value: a.id, label: a.name }));
  return (
    <span className="notebook-area-switch">
      <ChipSelect
        label="Area"
        options={
          all ? [{ value: ALL, label: 'All areas' }, ...options] : options
        }
        value={all?.selected ? ALL : area}
        onChange={(next) => {
          if (next === ALL) {
            all?.onChange(true);
            return;
          }
          setArea(next);
          all?.onChange(false);
        }}
      />
    </span>
  );
}
