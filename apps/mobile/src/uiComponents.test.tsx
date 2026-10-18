import { tokens } from '@gagnechris/tokens';
import { ActionSheetIOS, Switch } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectAccessible } from '../test/accessible';
import { allText, byLabel, render } from '../test/render';
import { color, MIN_TARGET } from './theme';
import { Button, type ButtonVariant } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { Chip, ChipSelect, type ChipTone } from './ui/Chip';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { IconButton, type IconButtonVariant } from './ui/IconButton';
import { ListRow } from './ui/ListRow';
import { PressArea } from './ui/PressArea';
import { SearchInput } from './ui/SearchInput';
import { SegmentedRadio } from './ui/SegmentedRadio';
import { Tabs } from './ui/Tabs';
import { TextButton } from './ui/TextButton';

const flatStyle = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatStyle))
    : style && typeof style === 'object'
      ? (style as Record<string, unknown>)
      : {};

const host = (renderer: ReactTestRenderer, type: string) =>
  renderer.root.findAll((node) => node.type === type);

const styleOf = (renderer: ReactTestRenderer, label: string) =>
  flatStyle(byLabel(renderer, label).props.style);

const symbols = (renderer: ReactTestRenderer) =>
  host(renderer, 'SymbolView').map((node) => node.props.name as string);

afterEach(() => vi.clearAllMocks());

describe('Button', () => {
  const variants: ButtonVariant[] = [
    'default',
    'primary',
    'danger',
    'ghost',
    'link',
  ];

  it('draws each web variant, default when none is given', async () => {
    const renderer = await render(
      <>
        <Button onPress={() => {}}>Plain</Button>
        {variants.map((variant) => (
          <Button key={variant} variant={variant} onPress={() => {}}>
            {variant}
          </Button>
        ))}
      </>,
    );
    expect(styleOf(renderer, 'Plain')).toEqual(styleOf(renderer, 'default'));
    expect(styleOf(renderer, 'default')).toMatchObject({
      backgroundColor: color.surface,
      borderColor: tokens.neutral[300],
    });
    expect(styleOf(renderer, 'primary').backgroundColor).toBe(color.accent);
    expect(styleOf(renderer, 'danger').borderColor).toBe(
      tokens.color.dangerBorder,
    );
    expect(styleOf(renderer, 'ghost').backgroundColor).toBeUndefined();
    expect(styleOf(renderer, 'link').flexGrow).toBe(0);
    const linkText = host(renderer, 'Text').find(
      (node) => node.props.children === 'link',
    )!;
    expect(flatStyle(linkText.props.style)).toMatchObject({
      color: tokens.color.link,
      textDecorationLine: 'underline',
    });
    expectAccessible(renderer);
  });

  it('keeps every size at least 44 pt tall', async () => {
    const renderer = await render(
      <>
        <Button size="sm" onPress={() => {}}>
          Small
        </Button>
        <Button onPress={() => {}}>Medium</Button>
        <Button size="lg" onPress={() => {}}>
          Large
        </Button>
      </>,
    );
    const heights = ['Small', 'Medium', 'Large'].map(
      (label) => styleOf(renderer, label).minHeight as number,
    );
    expect(heights[0]).toBe(MIN_TARGET);
    expect(heights[1]).toBeGreaterThan(heights[0]!);
    expect(heights[2]).toBeGreaterThan(heights[1]!);
  });

  it('shows a spinner and ignores presses while loading, and dims when disabled', async () => {
    const onPress = vi.fn();
    const renderer = await render(
      <>
        <Button loading onPress={onPress}>
          Save
        </Button>
        <Button disabled onPress={onPress}>
          Off
        </Button>
      </>,
    );
    const save = byLabel(renderer, 'Save');
    expect(save.props.accessibilityState).toEqual({
      disabled: false,
      busy: true,
    });
    expect(save.props.onPress).toBeUndefined();
    expect(host(renderer, 'ActivityIndicator')).toHaveLength(1);
    expect(allText(renderer)).toContain('Save');
    expect(styleOf(renderer, 'Off').opacity).toBe(0.55);
  });
});

describe('IconButton', () => {
  const variants: IconButtonVariant[] = ['ghost', 'outline', 'danger'];

  it('takes the web variants and sizes, reaching 44 pt through its slop', async () => {
    const renderer = await render(
      <>
        {variants.map((variant) => (
          <IconButton
            key={variant}
            label={variant}
            variant={variant}
            size="sm"
            onPress={() => {}}
          >
            <Icon name="ellipsis" />
          </IconButton>
        ))}
        <IconButton label="Large" size="lg" onPress={() => {}}>
          <Icon name="ellipsis" />
        </IconButton>
      </>,
    );
    expect(styleOf(renderer, 'outline')).toMatchObject({
      backgroundColor: color.surface,
      borderColor: tokens.neutral[300],
    });
    expect(styleOf(renderer, 'ghost').borderWidth).toBeUndefined();
    expect(byLabel(renderer, 'ghost').props.hitSlop).toBe(8);
    expect(styleOf(renderer, 'Large').minHeight).toBe(MIN_TARGET);
    expect(byLabel(renderer, 'Large').props.hitSlop).toBeUndefined();
    expectAccessible(renderer);
  });

  it('reads a toggle as selected and adds its count to the label', async () => {
    const renderer = await render(
      <IconButton label="Filters" pressed count={3} onPress={() => {}}>
        <Icon name="line.3.horizontal.decrease" />
      </IconButton>,
    );
    const button = byLabel(renderer, 'Filters, 3');
    expect(button.props.accessibilityState).toEqual({ selected: true });
    expect(flatStyle(button.props.style).backgroundColor).toBe(
      color.accentSoft,
    );
    expect(allText(renderer)).toBe('3');
  });
});

describe('Checkbox', () => {
  it('draws square and round shapes with their extra states', async () => {
    const onChange = vi.fn();
    const renderer = await render(
      <>
        <Checkbox label="Square" checked={false} onChange={onChange} />
        <Checkbox
          label="Mixed"
          checked={false}
          indeterminate
          onChange={onChange}
        />
        <Checkbox label="Round" shape="round" checked onChange={onChange} />
        <Checkbox
          label="Dropped"
          shape="round"
          checked={false}
          dropped
          onChange={onChange}
        />
      </>,
    );
    expect(symbols(renderer)).toEqual([
      'square',
      'minus.square.fill',
      'checkmark.circle.fill',
      'minus.circle',
    ]);
    expect(byLabel(renderer, 'Mixed').props.accessibilityState.checked).toBe(
      'mixed',
    );
    expect(byLabel(renderer, 'Dropped').props.accessibilityState.checked).toBe(
      false,
    );
    expect(byLabel(renderer, 'Dropped').props.accessibilityValue).toEqual({
      text: 'Dropped',
    });
    act(() => byLabel(renderer, 'Round').props.onPress());
    expect(onChange).toHaveBeenCalledWith(false);
    expectAccessible(renderer);
  });
});

describe('Chip and ChipSelect', () => {
  const tones: ChipTone[] = ['neutral', 'selected', 'warning', 'danger'];

  it('draws the four web tones', async () => {
    const renderer = await render(
      <>
        {tones.map((tone) => (
          <Chip key={tone} tone={tone} onPress={() => {}}>
            {tone}
          </Chip>
        ))}
      </>,
    );
    expect(styleOf(renderer, 'neutral').backgroundColor).toBe(color.fill);
    expect(styleOf(renderer, 'selected')).toMatchObject({
      backgroundColor: tokens.primary[50],
      borderColor: tokens.primary[300],
    });
    expect(styleOf(renderer, 'warning').backgroundColor).toBe(
      tokens.color.warningBg,
    );
    expect(styleOf(renderer, 'danger').borderColor).toBe(
      tokens.color.dangerBorder,
    );
    expectAccessible(renderer);
  });

  it('draws the add chip dashed, in the accent colour', async () => {
    const renderer = await render(
      <Chip tone="add" onPress={() => {}}>
        + tag
      </Chip>,
    );
    expect(styleOf(renderer, '+ tag')).toMatchObject({
      backgroundColor: color.surface,
      borderStyle: 'dashed',
    });
    expect(
      flatStyle(renderer.root.findByType('Text' as never).props.style).color,
    ).toBe(color.accent);
  });

  it('has a labelled remove button with a 44 pt target', async () => {
    const onRemove = vi.fn();
    const renderer = await render(<Chip onRemove={onRemove}>work</Chip>);
    const remove = byLabel(renderer, 'Remove work');
    act(() => remove.props.onPress());
    expect(onRemove).toHaveBeenCalled();
    const { minWidth, minHeight } = flatStyle(remove.props.style);
    expect((minWidth as number) + 2 * remove.props.hitSlop).toBe(MIN_TARGET);
    expect((minHeight as number) + 2 * remove.props.hitSlop).toBe(MIN_TARGET);
    expectAccessible(renderer);
  });

  it('keeps the remove button reachable on a chip that also presses', async () => {
    const onPress = vi.fn();
    const onRemove = vi.fn();
    const renderer = await render(
      <Chip onPress={onPress} onRemove={onRemove}>
        work
      </Chip>,
    );
    act(() => byLabel(renderer, 'work').props.onPress());
    act(() => byLabel(renderer, 'Remove work').props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expectAccessible(renderer);
  });

  it('picks from an action sheet with the current choice disabled', async () => {
    const onChange = vi.fn();
    const renderer = await render(
      <ChipSelect
        label="Area"
        title="Show notes and tasks from"
        options={[
          { value: 'work', label: 'Work' },
          { value: 'home', label: 'Home' },
        ]}
        value="work"
        onChange={onChange}
      />,
    );
    act(() => byLabel(renderer, 'Area: Work').props.onPress());
    const [options, choose] = vi.mocked(
      ActionSheetIOS.showActionSheetWithOptions,
    ).mock.lastCall!;
    expect(options).toMatchObject({
      title: 'Show notes and tasks from',
      options: ['Work', 'Home', 'Cancel'],
      cancelButtonIndex: 2,
      disabledButtonIndices: [0],
    });
    choose(1);
    expect(onChange).toHaveBeenCalledWith('home');
    expectAccessible(renderer);
  });
});

describe('SegmentedRadio and Tabs', () => {
  it('take the web option and item shapes', async () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    const renderer = await render(
      <>
        <SegmentedRadio
          label="Status"
          options={[
            { value: 'open', label: 'Open' },
            { value: 'done', label: 'Done' },
          ]}
          value="open"
          onChange={onChange}
        />
        <Tabs
          label="Lists"
          items={[
            { key: 'stillOpen', label: 'Still open', count: 2 },
            { key: 'comingUp', label: 'Coming up', count: 0 },
          ]}
          selected="comingUp"
          onSelect={onSelect}
        />
      </>,
    );
    expect(byLabel(renderer, 'Open').props.accessibilityState).toEqual({
      selected: true,
    });
    act(() => byLabel(renderer, 'Done').props.onPress());
    expect(onChange).toHaveBeenCalledWith('done');
    expect(byLabel(renderer, 'Coming up · 0').props.accessibilityState).toEqual(
      { selected: true },
    );
    act(() => byLabel(renderer, 'Still open · 2').props.onPress());
    expect(onSelect).toHaveBeenCalledWith('stillOpen');
    expectAccessible(renderer);
  });
});

describe('ListRow, SearchInput and EmptyState', () => {
  it('ListRow shows meta and marks the current row', async () => {
    const renderer = await render(
      <ListRow title="Default area" meta="Work" current onPress={() => {}} />,
    );
    const row = byLabel(renderer, 'Default area, Work');
    expect(row.props.accessibilityState).toEqual({ selected: true });
    expect(flatStyle(row.props.style).backgroundColor).toBe(color.accentSoft);
    expectAccessible(renderer);
  });

  it('ListRow leaves a control at its end reachable on its own', async () => {
    const renderer = await render(
      <ListRow
        title="Present"
        control={<Switch accessibilityLabel="Present" value={false} />}
      />,
    );
    expect(
      renderer.root.findAll(
        (node) =>
          typeof node.type === 'string' && node.props.accessible === true,
      ),
    ).toEqual([]);
    expect(byLabel(renderer, 'Present').type).toBe('Switch');
    expectAccessible(renderer);
  });

  it('expectAccessible flags a control inside one accessible element', async () => {
    const renderer = await render(
      <ListRow
        title="Present"
        trailing={<Switch accessibilityLabel="Present" value={false} />}
      />,
    );
    expect(() => expectAccessible(renderer)).toThrow(
      /Switch "Present" sits inside "Present"/,
    );
  });

  it('SearchInput reports each change through onValueChange', async () => {
    const onValueChange = vi.fn();
    const renderer = await render(
      <SearchInput
        placeholder="Search notes"
        value=""
        onValueChange={onValueChange}
      />,
    );
    act(() => byLabel(renderer, 'Search notes').props.onChangeText('pla'));
    expect(onValueChange).toHaveBeenCalledWith('pla');
    expectAccessible(renderer);
  });

  it('EmptyState reads its text as one element, with the action beside it', async () => {
    const renderer = await render(
      <EmptyState
        icon="doc.text"
        title="No notes yet"
        action={<Button onPress={() => {}}>New page</Button>}
      >
        Pages you write show here.
      </EmptyState>,
    );
    expect(
      byLabel(renderer, 'No notes yet. Pages you write show here.').props
        .accessible,
    ).toBe(true);
    expect(byLabel(renderer, 'New page')).toBeDefined();
    expectAccessible(renderer);
  });
});

describe('TextButton and PressArea', () => {
  it('TextButton reads its text, or the label it is given, and dims when disabled', async () => {
    const onPress = vi.fn();
    const renderer = await render(
      <>
        <TextButton onPress={onPress}>Cancel</TextButton>
        <TextButton
          strong
          disabled
          accessibilityLabel="Jump to today"
          onPress={() => {}}
        >
          Today
        </TextButton>
      </>,
    );
    act(() => byLabel(renderer, 'Cancel').props.onPress());
    expect(onPress).toHaveBeenCalled();
    expect(styleOf(renderer, 'Cancel')).toMatchObject({
      minWidth: MIN_TARGET,
      minHeight: MIN_TARGET,
    });
    const today = byLabel(renderer, 'Jump to today');
    expect(today.props.accessibilityState).toEqual({ disabled: true });
    expect(today.props.disabled).toBe(true);
    expect(allText(renderer)).toContain('Today');
    expectAccessible(renderer);
  });

  it('PressArea is one element with its role, label and state', async () => {
    const onPress = vi.fn();
    const renderer = await render(
      <PressArea
        accessibilityRole="tab"
        accessibilityLabel="Editor"
        accessibilityState={{ selected: true }}
        onPress={onPress}
        style={{ minHeight: MIN_TARGET }}
      >
        <Icon name="checkmark" />
      </PressArea>,
    );
    const area = byLabel(renderer, 'Editor');
    expect(area.props.accessibilityRole).toBe('tab');
    expect(area.props.accessibilityState).toEqual({ selected: true });
    act(() => area.props.onPress());
    expect(onPress).toHaveBeenCalled();
    expectAccessible(renderer);
  });
});
