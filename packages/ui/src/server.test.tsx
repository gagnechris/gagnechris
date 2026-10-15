// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  BottomSheet,
  Button,
  ConfirmDialog,
  Field,
  SegmentedRadio,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
} from './index.js';

const noop = () => {};

describe('components render without a browser', () => {
  it.each([
    ['Button', <Button>Save</Button>, 'Save'],
    ['Button as a link', <Button href="/posts">Posts</Button>, 'href="/posts"'],
    [
      'Field',
      <Field label="Title" hint="Shown in lists">
        <TextInput defaultValue="Hello" />
      </Field>,
      'Shown in lists',
    ],
    ['TextArea', <TextArea defaultValue="Body" />, 'Body'],
    [
      'Select',
      <Select defaultValue="b">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
      'kit-input',
    ],
    [
      'StatusBadge',
      <StatusBadge status="published" hasUnpublishedChanges />,
      'Unpublished changes',
    ],
    [
      'SegmentedRadio',
      <SegmentedRadio
        label="Status"
        options={[
          { value: 'all', label: 'All' },
          { value: 'draft', label: 'Draft', count: 2 },
        ]}
        value="all"
        onChange={noop}
      />,
      'role="radiogroup"',
    ],
    [
      'ConfirmDialog',
      <ConfirmDialog
        message="Delete this note?"
        action="Delete"
        onAnswer={noop}
      />,
      'Delete this note?',
    ],
  ])('%s', (_name, element, expected) => {
    expect(renderToString(element)).toContain(expected);
  });

  it('BottomSheet renders nothing on the server', () => {
    expect(
      renderToString(
        <BottomSheet title="Details" onClose={noop}>
          Body
        </BottomSheet>,
      ),
    ).toBe('');
  });
});
