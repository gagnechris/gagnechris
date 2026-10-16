import { SegmentTrack } from './SegmentedRadio';

type TabItem<K extends string> = { key: K; label: string; count?: number };

type Props<K extends string> = {
  label: string;
  items: readonly TabItem<K>[];
  selected: K;
  onSelect: (key: K) => void;
};

/** Switches between views of one thing, drawn as iOS segments. */
export const Tabs = <K extends string>({
  label,
  items,
  selected,
  onSelect,
}: Props<K>) => (
  <SegmentTrack
    label={label}
    segments={items}
    selected={selected}
    onSelect={(key) => onSelect(key as K)}
  />
);
