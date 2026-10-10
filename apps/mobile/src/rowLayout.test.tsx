import type { ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { render } from '../test/render';
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

  it('centers a list row title on its icons', async () => {
    const renderer = await render(<Row title="Sign out" />);
    expectWrappedLinesCentered(renderer);
  });
});
