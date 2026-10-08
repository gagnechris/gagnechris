import {
  EVERY_MARKDOWN_ELEMENT,
  markdownNoteOfSize,
} from '@gagnechris/shared/fixtures/every-markdown-element';
import { tokens } from '@gagnechris/tokens';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { MarkdownView } from '../../src/markdown/MarkdownView';

const SAMPLE = `${EVERY_MARKDOWN_ELEMENT}
{{task:01J9Z3A0000000000000000001}}
{{task:01J9Z3A0000000000000000002}}

Unsafe: [javascript link](javascript:alert(1)) and <b>raw</b> <script>alert(1)</script>HTML.
`;

const embedTasks = new Map([
  [
    '01J9Z3A0000000000000000001',
    { title: 'Review publisher retry PR', status: 'done' as const },
  ],
]);

/** Dev builds only: `gagnechris://dev/markdown`, or `?size=20480` for a long note. */
const MarkdownPreviewScreen = () => {
  const { size } = useLocalSearchParams<{ size?: string }>();
  const markdown = useMemo(
    () => (size ? markdownNoteOfSize(Number(size)) : SAMPLE),
    [size],
  );
  const [started] = useState(() => performance.now());
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      onLayout={() =>
        console.log(
          `[markdown] ${markdown.length} chars laid out in ${Math.round(performance.now() - started)} ms`,
        )
      }
    >
      <MarkdownView markdown={markdown} embedTasks={embedTasks} />
    </ScrollView>
  );
};

export default MarkdownPreviewScreen;

const styles = StyleSheet.create({
  content: {
    padding: tokens.space[6],
    paddingTop: tokens.space[16],
    backgroundColor: 'white',
  },
});
