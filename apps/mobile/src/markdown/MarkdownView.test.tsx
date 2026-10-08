import {
  EVERY_MARKDOWN_ELEMENT,
  EVERY_MARKDOWN_ELEMENT_TREE,
  markdownNoteOfSize,
  tidyMarkdownTree,
  type MarkdownTreeNode,
} from '@gagnechris/shared/fixtures/every-markdown-element';
import { Text } from 'react-native';
import {
  act,
  create,
  type ReactTestRenderer,
  type ReactTestRendererJSON,
} from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTEBOOK_ORIGIN, openMarkdownLink } from './links';
import { MarkdownView } from './MarkdownView';

const native = vi.hoisted(() => ({
  openBrowserAsync: vi.fn(async (_url: string, _options?: object) => ({
    type: 'opened',
  })),
  openURL: vi.fn(async (_url: string) => true),
}));

// react-native ships Flow sources Vitest can't load; host components as
// strings render the same tree react-test-renderer would get on device.
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  ScrollView: 'ScrollView',
  StyleSheet: {
    create: <T,>(styles: T) => styles,
    hairlineWidth: 0.5,
  },
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) =>
      options.ios ?? options.default,
  },
  Linking: { openURL: native.openURL },
}));

vi.mock('expo-web-browser', () => ({
  openBrowserAsync: native.openBrowserAsync,
}));

// React 19 warns unless the environment opts in to act().
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const render = (element: React.ReactElement): ReactTestRenderer => {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  return renderer!;
};

const ATTR_FOR_ARG: Record<string, string> = { ol: 'start', pre: 'lang' };

/** The rendered host tree as the HTML elements its testIDs name. */
const nativeTree = (renderer: ReactTestRenderer): MarkdownTreeNode[] => {
  const walk = (node: ReactTestRendererJSON | string): MarkdownTreeNode[] => {
    if (typeof node === 'string') return [node];
    const children = () => (node.children ?? []).flatMap(walk);
    const testID = node.props.testID as string | undefined;
    if (!testID?.startsWith('md-')) return children();
    const [tag, arg] = testID.slice(3).split(':') as [string, string?];
    switch (tag) {
      case 'root':
        return children();
      case 'marker':
      case 'checkbox':
        return [];
      case 'a': {
        native.openBrowserAsync.mockClear();
        act(() => node.props.onPress());
        const href = native.openBrowserAsync.mock.calls[0]?.[0] ?? '';
        return [{ tag, attrs: { href }, children: children() }];
      }
      case 'img': {
        const src = node.props.source?.uri as string | undefined;
        const alt = node.props.accessibilityLabel as string;
        return [{ tag, attrs: src ? { src, alt } : { alt }, children: [] }];
      }
      case 'br':
        return [{ tag, children: [] }];
      case 'li': {
        const box = node.children?.find(
          (c): c is ReactTestRendererJSON =>
            typeof c !== 'string' && c.props.testID === 'md-checkbox',
        );
        return [
          {
            tag,
            ...(box && {
              attrs: { checked: box.props.accessibilityState.checked },
            }),
            children: children(),
          },
        ];
      }
      default: {
        const attr = arg && ATTR_FOR_ARG[tag];
        return [
          {
            tag,
            ...(attr && {
              attrs: { [attr]: tag === 'ol' ? Number(arg) : arg },
            }),
            children: children(),
          },
        ];
      }
    }
  };
  const json = renderer.toJSON();
  const roots = json === null ? [] : Array.isArray(json) ? json : [json];
  return tidyMarkdownTree(roots.flatMap(walk));
};

const findAllByTestId = (renderer: ReactTestRenderer, id: string) =>
  renderer.root.findAll(
    (n) => typeof n.type === 'string' && n.props.testID === id,
  );

const TASK_ID = '01J9Z3A0000000000000000001';

beforeEach(() => {
  native.openBrowserAsync.mockClear();
  native.openURL.mockClear();
});

describe('MarkdownView', () => {
  it('renders every markdown element with the structure of the web preview', () => {
    const renderer = render(<MarkdownView markdown={EVERY_MARKDOWN_ELEMENT} />);
    expect(nativeTree(renderer)).toEqual(EVERY_MARKDOWN_ELEMENT_TREE);
  });

  it('draws headings as headers, task items as read-only checkboxes and code in mono', () => {
    const renderer = render(<MarkdownView markdown={EVERY_MARKDOWN_ELEMENT} />);
    expect(
      renderer.root
        .findAll(
          (n) =>
            typeof n.type === 'string' &&
            n.props.accessibilityRole === 'header',
        )
        .map((n) => n.props.testID),
    ).toEqual(['md-h2', 'md-h3', 'md-h4']);
    expect(
      findAllByTestId(renderer, 'md-checkbox').map(
        (n) => n.props.accessibilityState,
      ),
    ).toEqual([
      { checked: true, disabled: true },
      { checked: false, disabled: true },
    ]);
    const mono = [
      ...findAllByTestId(renderer, 'md-code'),
      ...renderer.root.findAll(
        (n) => typeof n.type === 'string' && n.props.selectable === true,
      ),
    ];
    expect(mono).toHaveLength(2);
    for (const node of mono) {
      expect(node.props.style.fontFamily).toBe('Menlo');
    }
  });

  it('opens web links in the in-app browser and mail links with the system', () => {
    const renderer = render(
      <MarkdownView markdown="[site](/notes/x) [mail](mailto:a@example.com)" />,
    );
    const [site, mail] = findAllByTestId(renderer, 'md-a');
    act(() => site!.props.onPress());
    act(() => mail!.props.onPress());
    expect(native.openBrowserAsync).toHaveBeenCalledWith(
      `${NOTEBOOK_ORIGIN}/notes/x`,
      expect.objectContaining({ dismissButtonStyle: 'done' }),
    );
    expect(native.openURL).toHaveBeenCalledWith('mailto:a@example.com');
  });

  it('hands link presses to onLinkPress when given', () => {
    const onLinkPress = vi.fn();
    const renderer = render(
      <MarkdownView
        markdown="[a](https://a.example)"
        onLinkPress={onLinkPress}
      />,
    );
    act(() => findAllByTestId(renderer, 'md-a')[0]!.props.onPress());
    expect(onLinkPress).toHaveBeenCalledWith('https://a.example');
    expect(native.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('renders task embeds through renderTaskEmbed', () => {
    const renderTaskEmbed = vi.fn(({ id }: { id: string }) => (
      <Text testID="live-row">{id}</Text>
    ));
    const renderer = render(
      <MarkdownView
        markdown={`Before\n  {{task:${TASK_ID}}}\nAfter`}
        renderTaskEmbed={renderTaskEmbed}
      />,
    );
    expect(renderTaskEmbed).toHaveBeenCalledWith({ id: TASK_ID, indent: '  ' });
    const embed = findAllByTestId(renderer, `md-task-embed:${TASK_ID}`)[0]!;
    expect(embed.props.style).toContainEqual({ paddingLeft: 16 });
    expect(findAllByTestId(renderer, 'live-row')).toHaveLength(1);
    expect(JSON.stringify(renderer.toJSON())).not.toContain('{{task:');
  });

  it('falls back to taskEmbedFallbackLine without renderTaskEmbed', () => {
    const renderer = render(
      <MarkdownView
        markdown={`{{task:${TASK_ID}}}\n{{task:01J9Z3A0000000000000000002}}`}
        embedTasks={new Map([[TASK_ID, { title: 'Ship it', status: 'done' }]])}
      />,
    );
    expect(nativeTree(renderer)).toEqual([
      {
        tag: 'task-embed',
        children: [
          {
            tag: 'ul',
            children: [
              {
                tag: 'li',
                attrs: { checked: true },
                children: [{ tag: 'p', children: ['Ship it'] }],
              },
            ],
          },
        ],
      },
      {
        tag: 'task-embed',
        children: [
          {
            tag: 'ul',
            children: [
              {
                tag: 'li',
                attrs: { checked: false },
                children: [{ tag: 'p', children: ['(deleted task)'] }],
              },
            ],
          },
        ],
      },
    ]);
  });
});

describe('unsafe links', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '&#106;avascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//evil.example',
  ])('renders [click](%s) as plain text', (href) => {
    const renderer = render(
      <MarkdownView markdown={`a [click](<${href}>) b`} />,
    );
    expect(findAllByTestId(renderer, 'md-a')).toHaveLength(0);
    expect(
      renderer.root.findAll(
        (n) => typeof n.type === 'string' && n.props.onPress !== undefined,
      ),
    ).toHaveLength(0);
    expect(nativeTree(renderer)).toEqual([
      { tag: 'p', children: ['a click b'] },
    ]);
  });

  it('never opens an unsafe URL', async () => {
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,x',
      '//evil.example',
      'file:///etc/passwd',
    ]) {
      await openMarkdownLink(href);
    }
    expect(native.openBrowserAsync).not.toHaveBeenCalled();
    expect(native.openURL).not.toHaveBeenCalled();
  });

  it('shows raw HTML as text, never as markup', () => {
    const renderer = render(
      <MarkdownView
        markdown={
          '<b onclick="x()">bold</b> <script>alert(1)</script>\n\n<iframe src="https://evil.example"></iframe>'
        }
      />,
    );
    expect(nativeTree(renderer)).toEqual([{ tag: 'p', children: ['bold'] }]);
  });
});

describe('a 20 KB note', () => {
  it('parses and renders within budget', () => {
    const note = markdownNoteOfSize(20 * 1024);
    const warm = render(<MarkdownView markdown={note} />);
    act(() => warm.unmount());
    const runs = Array.from({ length: 5 }, () => {
      const start = performance.now();
      const renderer = render(<MarkdownView markdown={note} />);
      const elapsed = performance.now() - start;
      act(() => renderer.unmount());
      return elapsed;
    }).sort((a, b) => a - b);
    // Median; about 8 ms on a laptop and up to ~150 ms on a busy CI runner.
    // The bound catches superlinear regressions (a quadratic walk takes
    // seconds), not frame-level timing, which a parallel test run can't measure.
    expect(runs[2]).toBeLessThan(500);
  });

  it('skips unchanged blocks when the parent re-renders', () => {
    const note = markdownNoteOfSize(20 * 1024);
    const renderTaskEmbed = vi.fn(() => null);
    const renderer = render(
      <MarkdownView markdown={note} renderTaskEmbed={renderTaskEmbed} />,
    );
    const embeds = renderTaskEmbed.mock.calls.length;
    expect(embeds).toBeGreaterThan(0);
    act(() =>
      renderer.update(
        <MarkdownView markdown={note} renderTaskEmbed={renderTaskEmbed} />,
      ),
    );
    expect(renderTaskEmbed).toHaveBeenCalledTimes(embeds);
  });
});
