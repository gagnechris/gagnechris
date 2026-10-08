import {
  taskEmbedFallbackLine,
  type TaskEmbedMarkdownTask,
} from '@gagnechris/shared';
import {
  parseMarkdownBlocks,
  type MarkdownBlock,
  type MarkdownInline,
  type MarkdownListItem,
} from '@gagnechris/shared/markdown-ast';
import { memo, useMemo, useState, type ReactNode } from 'react';
import {
  Image,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { openMarkdownLink, resolveMarkdownUrl } from './links';
import { CELL_CHAR_WIDTH, styles } from './styles';

export type TaskEmbedLine = { id: string; indent: string };

export type MarkdownViewProps = {
  markdown: string;
  /** A live row for a `{{task:<ULID>}}` line. Without it the line shows `taskEmbedFallbackLine`. */
  renderTaskEmbed?: (embed: TaskEmbedLine) => ReactNode;
  /** Task records for the fallback line; a missing one reads "(deleted task)". */
  embedTasks?: ReadonlyMap<string, TaskEmbedMarkdownTask>;
  onLinkPress?: (href: string) => void;
};

type RenderContext = Pick<
  MarkdownViewProps,
  'renderTaskEmbed' | 'embedTasks'
> & { onLinkPress: (href: string) => void };

const openLink = (href: string) => {
  void openMarkdownLink(href);
};

// testIDs name the HTML element each node stands for, so tests can compare
// the native tree with the web preview's.
const Inlines = ({
  nodes,
  ctx,
}: {
  nodes: MarkdownInline[];
  ctx: RenderContext;
}): ReactNode =>
  nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return node.text;
      case 'strong':
        return (
          <Text key={i} testID="md-strong" style={styles.strong}>
            <Inlines nodes={node.children} ctx={ctx} />
          </Text>
        );
      case 'em':
        return (
          <Text key={i} testID="md-em" style={styles.em}>
            <Inlines nodes={node.children} ctx={ctx} />
          </Text>
        );
      case 'del':
        return (
          <Text key={i} testID="md-del" style={styles.del}>
            <Inlines nodes={node.children} ctx={ctx} />
          </Text>
        );
      case 'code':
        return (
          <Text key={i} testID="md-code" style={styles.inlineCode}>
            {node.text}
          </Text>
        );
      case 'break':
        return (
          <Text key={i} testID="md-br">
            {'\n'}
          </Text>
        );
      case 'link':
        return (
          <Text
            key={i}
            testID="md-a"
            accessibilityRole="link"
            accessibilityHint={node.title ?? undefined}
            style={styles.link}
            onPress={() => ctx.onLinkPress(node.href)}
          >
            <Inlines nodes={node.children} ctx={ctx} />
          </Text>
        );
      case 'image':
        // Paragraphs lift images out of the text run; this is the fallback
        // for one nested in a link or emphasis.
        return node.alt;
    }
  });

const MarkdownImage = ({ src, alt }: { src: string | null; alt: string }) => {
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const uri = src ? resolveMarkdownUrl(src) : null;
  if (!uri) {
    return (
      <Text testID="md-img" accessibilityLabel={alt} style={styles.imageAlt}>
        {alt}
      </Text>
    );
  }
  return (
    <Image
      testID="md-img"
      accessibilityLabel={alt}
      accessibilityIgnoresInvertColors
      source={{ uri }}
      resizeMode="contain"
      style={[styles.image, { aspectRatio }]}
      onLoad={({ nativeEvent: { source } }) => {
        if (source.width > 0 && source.height > 0) {
          setAspectRatio(source.width / source.height);
        }
      }}
    />
  );
};

const Paragraph = ({
  nodes,
  ctx,
}: {
  nodes: MarkdownInline[];
  ctx: RenderContext;
}) => {
  if (!nodes.some((node) => node.type === 'image')) {
    return (
      <Text testID="md-p" style={styles.paragraph}>
        <Inlines nodes={nodes} ctx={ctx} />
      </Text>
    );
  }
  // An image inside Text can't size itself, so it becomes its own row.
  const parts: ReactNode[] = [];
  let run: MarkdownInline[] = [];
  const flush = () => {
    const text = run.filter((n) => n.type !== 'text' || n.text.trim());
    if (text.length) {
      parts.push(
        <Text key={parts.length} style={styles.paragraphRun}>
          <Inlines nodes={run} ctx={ctx} />
        </Text>,
      );
    }
    run = [];
  };
  for (const node of nodes) {
    if (node.type === 'image') {
      flush();
      parts.push(
        <MarkdownImage key={parts.length} src={node.src} alt={node.alt} />,
      );
    } else {
      run.push(node);
    }
  }
  flush();
  return (
    <View testID="md-p" style={styles.paragraphBlock}>
      {parts}
    </View>
  );
};

const ListItem = ({
  item,
  marker,
  loose,
  ctx,
}: {
  item: MarkdownListItem;
  marker: string;
  loose: boolean;
  ctx: RenderContext;
}) => (
  <View testID="md-li" style={styles.listItem}>
    {item.task ? (
      <View
        testID="md-checkbox"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked, disabled: true }}
        style={[styles.checkbox, item.checked && styles.checkboxChecked]}
      >
        {item.checked ? (
          <Text style={styles.checkmark} importantForAccessibility="no">
            ✓
          </Text>
        ) : null}
      </View>
    ) : (
      <Text testID="md-marker" style={styles.marker}>
        {marker}
      </Text>
    )}
    <Blocks
      nodes={item.children}
      ctx={ctx}
      style={[styles.listItemBody, loose ? styles.looseGap : styles.tightGap]}
    />
  </View>
);

const cellWidth = (cells: MarkdownInline[][][], column: number): number => {
  const length = (nodes: MarkdownInline[]): number =>
    nodes.reduce(
      (sum, n) =>
        sum +
        ('text' in n
          ? n.text.length
          : 'children' in n
            ? length(n.children)
            : n.type === 'image'
              ? n.alt.length
              : 0),
      0,
    );
  const longest = Math.max(...cells.map((row) => length(row[column] ?? [])));
  return Math.min(240, Math.max(80, longest * CELL_CHAR_WIDTH + 24));
};

const Table = ({
  node,
  ctx,
}: {
  node: Extract<MarkdownBlock, { type: 'table' }>;
  ctx: RenderContext;
}) => {
  const all = [node.header, ...node.rows];
  const widths = node.header.map((_, column) => cellWidth(all, column));
  const textAlign = (column: number) => node.align[column] ?? 'left';
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View testID="md-table" style={styles.table}>
        {all.map((row, r) => (
          <View
            key={r}
            testID="md-tr"
            style={[styles.tableRow, r === 0 && styles.tableHeadRow]}
          >
            {row.map((cell, c) => (
              <View
                key={c}
                testID={r === 0 ? 'md-th' : 'md-td'}
                style={[styles.tableCell, { width: widths[c] }]}
              >
                <Text
                  style={[
                    styles.tableText,
                    r === 0 && styles.strong,
                    { textAlign: textAlign(c) },
                  ]}
                >
                  <Inlines nodes={cell} ctx={ctx} />
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const FallbackEmbed = ({
  embed,
  ctx,
}: {
  embed: TaskEmbedLine;
  ctx: RenderContext;
}) => {
  const task = ctx.embedTasks?.get(embed.id);
  const nodes = useMemo(
    () => parseMarkdownBlocks(taskEmbedFallbackLine({ indent: '' }, task)),
    [task],
  );
  return <Blocks nodes={nodes} ctx={ctx} style={styles.tightGap} />;
};

const Block = memo(function Block({
  node,
  ctx,
  first,
}: {
  node: MarkdownBlock;
  ctx: RenderContext;
  first: boolean;
}) {
  switch (node.type) {
    case 'heading':
      return (
        <Text
          testID={`md-h${node.depth}`}
          accessibilityRole="header"
          style={[
            styles.heading,
            styles[`h${node.depth}` as 'h1'],
            !first && styles.headingAfterBlock,
          ]}
        >
          <Inlines nodes={node.children} ctx={ctx} />
        </Text>
      );
    case 'paragraph':
      return <Paragraph nodes={node.children} ctx={ctx} />;
    case 'blockquote':
      return (
        <Blocks
          testID="md-blockquote"
          nodes={node.children}
          ctx={ctx}
          style={[styles.blockquote, styles.looseGap]}
        />
      );
    case 'list':
      return (
        <View
          testID={
            node.ordered
              ? node.start === 1
                ? 'md-ol'
                : `md-ol:${node.start}`
              : 'md-ul'
          }
          style={node.loose ? styles.looseGap : styles.listGap}
        >
          {node.items.map((item, i) => (
            <ListItem
              key={i}
              item={item}
              marker={node.ordered ? `${node.start + i}.` : '•'}
              loose={node.loose}
              ctx={ctx}
            />
          ))}
        </View>
      );
    case 'code':
      return (
        <View
          testID={node.lang ? `md-pre:${node.lang}` : 'md-pre'}
          style={styles.codeBlock}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text style={styles.codeText} selectable>
              {node.text}
            </Text>
          </ScrollView>
        </View>
      );
    case 'hr':
      return <View testID="md-hr" style={styles.hr} />;
    case 'table':
      return <Table node={node} ctx={ctx} />;
    case 'taskEmbed':
      return (
        <View
          testID={`md-task-embed:${node.id}`}
          style={[styles.taskEmbed, { paddingLeft: node.indent.length * 8 }]}
        >
          {ctx.renderTaskEmbed ? (
            ctx.renderTaskEmbed({ id: node.id, indent: node.indent })
          ) : (
            <FallbackEmbed embed={node} ctx={ctx} />
          )}
        </View>
      );
  }
});

const Blocks = ({
  nodes,
  ctx,
  style,
  testID,
}: {
  nodes: MarkdownBlock[];
  ctx: RenderContext;
  style: StyleProp<ViewStyle>;
  testID?: string;
}) => (
  <View testID={testID} style={style}>
    {nodes.map((node, i) => (
      <Block key={i} node={node} ctx={ctx} first={i === 0} />
    ))}
  </View>
);

/**
 * Note bodies and task descriptions, structured like the web Notebook
 * preview. Raw HTML shows as its text; links open in SFSafariViewController.
 */
export const MarkdownView = ({
  markdown,
  renderTaskEmbed,
  embedTasks,
  onLinkPress = openLink,
}: MarkdownViewProps) => {
  const nodes = useMemo(() => parseMarkdownBlocks(markdown), [markdown]);
  const ctx = useMemo(
    () => ({ renderTaskEmbed, embedTasks, onLinkPress }),
    [renderTaskEmbed, embedTasks, onLinkPress],
  );
  return (
    <Blocks testID="md-root" nodes={nodes} ctx={ctx} style={styles.root} />
  );
};
