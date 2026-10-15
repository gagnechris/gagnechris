import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';
import { ChipsInput } from './ChipsInput.js';

const Harness = ({
  initial = [],
  maxItems,
  maxItemLength,
}: {
  initial?: string[];
  maxItems?: number;
  maxItemLength?: number;
}) => {
  const [tags, setTags] = useState(initial);
  return (
    <ChipsInput
      label="Tags"
      listLabel="Post tags"
      itemLabel={(tag) => `tag ${tag}`}
      placeholder="Add tag"
      fullPlaceholder="Tag limit reached"
      maxItems={maxItems}
      maxItemLength={maxItemLength}
      value={tags}
      onChange={setTags}
    />
  );
};

const chips = () =>
  within(screen.getByRole('list', { name: 'Post tags' }))
    .queryAllByRole('listitem')
    .map((li) => li.textContent);

describe('ChipsInput', () => {
  test('Enter and commas add chips, skipping blanks and duplicates', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['react']} />);
    const input = screen.getByLabelText('Tags');
    await user.type(input, 'aws{Enter}');
    await user.type(input, ' go , React,,design,');
    expect(chips()).toEqual(['react', 'aws', 'go', 'design']);
    expect(input).toHaveValue('');
  });

  test('leaving the box adds what was typed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Tags'), 'go');
    await user.tab();
    expect(chips()).toEqual(['go']);
  });

  test('a chip is removed by its button or Backspace on an empty box', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['react', 'aws', 'go']} />);
    await user.click(screen.getByRole('button', { name: 'Remove tag aws' }));
    expect(chips()).toEqual(['react', 'go']);
    await user.type(screen.getByLabelText('Tags'), '{Backspace}');
    expect(chips()).toEqual(['react']);
  });

  test('stops at maxItems and trims each item to maxItemLength', async () => {
    const user = userEvent.setup();
    render(<Harness maxItems={2} maxItemLength={3} />);
    const input = screen.getByLabelText('Tags');
    await user.type(input, 'reactive,aws,go,');
    expect(chips()).toEqual(['rea', 'aws']);
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', 'Tag limit reached');
  });
});
