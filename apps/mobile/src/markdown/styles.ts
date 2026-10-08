import { tokens } from '@gagnechris/tokens';
import { Platform, StyleSheet } from 'react-native';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
const body = tokens.text.body;
const lineHeight = Math.round(body * 1.5);

/** Rough width of one character of table text, to size columns. */
export const CELL_CHAR_WIDTH = 7.5;

export const styles = StyleSheet.create({
  root: { gap: tokens.space[3] },
  looseGap: { gap: tokens.space[2] },
  tightGap: { gap: 2 },
  listGap: { gap: tokens.space[1] },
  paragraph: { fontSize: body, lineHeight, color: tokens.color.prose },
  paragraphBlock: { gap: tokens.space[2] },
  paragraphRun: { fontSize: body, lineHeight, color: tokens.color.prose },
  heading: { color: tokens.color.ink, fontWeight: '700' },
  headingAfterBlock: { marginTop: tokens.space[3] },
  h1: { fontSize: tokens.text['2xl'], lineHeight: 34, letterSpacing: -0.4 },
  h2: { fontSize: tokens.text.xl, lineHeight: 28, letterSpacing: -0.3 },
  h3: { fontSize: tokens.text.lg, lineHeight: 24 },
  h4: { fontSize: body, lineHeight },
  h5: { fontSize: tokens.text.base, lineHeight: 22 },
  h6: {
    fontSize: tokens.text.sm,
    lineHeight: 20,
    color: tokens.color.inkSoft,
  },
  strong: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  del: { textDecorationLine: 'line-through' },
  link: { color: tokens.color.link, textDecorationLine: 'underline' },
  inlineCode: {
    fontFamily: mono,
    fontSize: body * 0.88,
    backgroundColor: tokens.neutral[100],
    color: tokens.color.ink,
  },
  codeBlock: {
    backgroundColor: tokens.neutral[100],
    borderRadius: tokens.radius.md,
    padding: tokens.space[3],
  },
  codeText: {
    fontFamily: mono,
    fontSize: tokens.text.sm,
    lineHeight: 20,
    color: tokens.color.ink,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: tokens.neutral[300],
    paddingLeft: tokens.space[3],
  },
  listItem: { flexDirection: 'row', alignItems: 'flex-start' },
  listItemBody: { flex: 1, minWidth: 0 },
  marker: {
    width: 24,
    fontSize: body,
    lineHeight,
    color: tokens.neutral[500],
  },
  checkbox: {
    width: 20,
    height: 20,
    marginTop: (lineHeight - 20) / 2,
    marginRight: tokens.space[2],
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: tokens.neutral[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: tokens.primary[600],
    borderColor: tokens.primary[600],
  },
  checkmark: { color: 'white', fontSize: 13, fontWeight: '700' },
  hr: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.neutral[300],
    marginVertical: tokens.space[2],
  },
  image: {
    width: '100%',
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.neutral[100],
  },
  imageAlt: {
    fontSize: tokens.text.sm,
    fontStyle: 'italic',
    color: tokens.neutral[500],
  },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.neutral[200],
    borderRadius: tokens.radius.sm,
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.neutral[200],
  },
  tableHeadRow: {
    borderTopWidth: 0,
    backgroundColor: tokens.neutral[50],
  },
  tableCell: {
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
  },
  tableText: {
    fontSize: tokens.text.sm,
    lineHeight: 20,
    color: tokens.color.prose,
  },
  taskEmbed: { minHeight: 28 },
});
