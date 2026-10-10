import type { ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { render } from '../test/render';
import { MIN_TARGET } from './theme';
import { Row } from './ui/Row';
import { TaskEmbedRow } from './ui/TaskEmbedRow';

const flatStyle = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatStyle))
    : style && typeof style === 'object'
      ? (style as Record<string, unknown>)
      : {};

// Yoga packs wrapped lines at the top of a box taller than they are, so a
// wrapping row with a minimum height leaves its text above its centered icons.
function expectWrappedLinesCentered(renderer: ReactTestRenderer) {
  const wrapping = renderer.root
    .findAll((node) => typeof node.type === 'string')
    .map((node) => flatStyle(node.props.style))
    .filter((style) => style.flexWrap === 'wrap' && style.minHeight);
  expect(wrapping.length).toBeGreaterThan(0);
  for (const style of wrapping) expect(style.alignContent).toBe('center');
}

describe('row layout', () => {
  it('centers an embedded task title on its checkbox', async () => {
    const renderer = await render(
      <TaskEmbedRow
        state={{
          kind: 'task',
          task: { title: 'do things', status: 'todo', priority: 'med' },
          onToggle: () => undefined,
        }}
        onOpen={() => undefined}
      />,
    );
    expectWrappedLinesCentered(renderer);
  });

  it('gives every embedded task the same space above and below', async () => {
    const renderer = await render(
      <TaskEmbedRow
        state={{
          kind: 'task',
          task: { title: 'do things', status: 'todo', priority: 'high' },
          due: { text: 'due Mon', title: 'Monday, Oct 12', overdue: false },
          onToggle: () => undefined,
        }}
        onOpen={() => undefined}
      />,
    );
    const styles = renderer.root
      .findAll((node) => typeof node.type === 'string')
      .map((node) => flatStyle(node.props.style));
    const title = styles.find((style) => style.lineHeight)!;
    const button = styles.find((style) => style.flexWrap === 'wrap')!;
    // A one-line title fills the 44 pt target exactly, so a taller row (pills
    // wrapped) keeps the same padding instead of losing it.
    expect(
      (title.lineHeight as number) + 2 * (button.paddingVertical as number),
    ).toBe(MIN_TARGET);
  });

  it('centers a list row title on its icons', async () => {
    const renderer = await render(<Row title="Sign out" />);
    expectWrappedLinesCentered(renderer);
  });
});
