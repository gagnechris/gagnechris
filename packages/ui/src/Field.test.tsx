import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { Field, Select, TextArea, TextInput } from './Field.js';

describe('Field', () => {
  test('renders label, input, and hint', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field label="Name" hint="Shown on the homepage">
        <TextInput value="Chris" onChange={onChange} />
      </Field>,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Shown on the homepage')).toBeInTheDocument();
    const input = screen.getByDisplayValue('Chris');
    await user.clear(input);
    await user.type(input, 'Ada');
    expect(onChange).toHaveBeenCalled();
  });

  test('labels the control and describes it by the hint', async () => {
    const user = userEvent.setup();
    render(
      <Field label="Slug" hint="Lowercase and dashes">
        <TextInput defaultValue="hello" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Slug' });
    expect(input).toHaveAccessibleDescription('Lowercase and dashes');
    expect(input).not.toHaveAttribute('aria-invalid');
    await user.click(screen.getByText('Slug'));
    expect(input).toHaveFocus();
  });

  test('an error replaces the hint and marks the control invalid', () => {
    render(
      <Field label="Email" hint="We reply here" error="Enter an email address">
        <TextInput defaultValue="nope" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveClass('kit-input--invalid');
    expect(input).toHaveAccessibleDescription('Enter an email address');
    expect(screen.queryByText('We reply here')).toBeNull();
  });

  test('a prefix sits before the input, hidden from screen readers so the hint is the description', () => {
    render(
      <Field label="Slug" hint="Follows the title.">
        <TextInput prefix="/" defaultValue="hello" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Slug' });
    expect(input).toHaveAccessibleDescription('Follows the title.');
    const group = input.closest('.kit-input-group');
    expect(group).not.toBeNull();
    expect(group!.querySelector('.kit-input-group__prefix')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  test('TextArea applies textarea classes and grows by default', () => {
    render(
      <Field label="About" fullWidth>
        <TextArea rows={3} value="Hello" onChange={() => {}} />
      </Field>,
    );
    const area = screen.getByRole('textbox', { name: 'About' });
    expect(area.tagName).toBe('TEXTAREA');
    expect(area).toHaveClass('kit-input', 'kit-textarea', 'kit-textarea--grow');
    expect(area.style.height).not.toBe('');
  });

  test('Select is labelled and styled with a chevron box', async () => {
    const user = userEvent.setup();
    render(
      <Field label="Area">
        <Select defaultValue="work" size="sm">
          <option value="work">Work</option>
          <option value="home">Home</option>
        </Select>
      </Field>,
    );
    const select = screen.getByRole('combobox', { name: 'Area' });
    expect(select).toHaveClass('kit-select', 'kit-input--sm');
    await user.selectOptions(select, 'home');
    expect(select).toHaveValue('home');
  });

  test('editorial tone reaches the control from the Field', () => {
    render(
      <Field label="Name" tone="editorial">
        <TextInput />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveClass(
      'kit-input--editorial',
    );
  });

  test('keeps aria-invalid and aria-describedby set by the caller', () => {
    render(
      <>
        <Field label="End" hint="Month and year">
          <TextInput aria-invalid="true" aria-describedby="end-error" />
        </Field>
        <p id="end-error">End is before start</p>
      </>,
    );
    const input = screen.getByRole('textbox', { name: 'End' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveClass('kit-input--invalid');
    expect(input).toHaveAccessibleDescription(
      'Month and year End is before start',
    );
  });
});
