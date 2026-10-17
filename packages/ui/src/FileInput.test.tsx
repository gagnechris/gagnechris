import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { Field } from './Field.js';
import { FileInput } from './FileInput.js';

const file = (name: string) => new File(['x'], name, { type: 'image/png' });

describe('FileInput', () => {
  test('the button is labelled by the Field and opens the picker from the keyboard', async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    render(
      <Field label="Cover image">
        <FileInput onFiles={onFiles} accept="image/*" hint="PNG or JPEG" />
      </Field>,
    );
    const button = screen.getByRole('button', {
      name: 'Cover image Choose file',
    });
    expect(button).toHaveAccessibleDescription('PNG or JPEG');
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    const click = vi.spyOn(input, 'click');
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(click).toHaveBeenCalled();

    await user.upload(input, file('cover.png'));
    expect(onFiles).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'cover.png' }),
    ]);
  });

  test('a drop shows the drag-over state and hands over the files', () => {
    const onFiles = vi.fn();
    const { container } = render(
      <FileInput aria-label="Attachment" onFiles={onFiles} />,
    );
    const zone = container.querySelector('.ui-file')!;
    const dataTransfer = {
      types: ['Files'],
      files: [file('a.png')],
      dropEffect: '',
    };
    fireEvent.dragEnter(zone, { dataTransfer });
    expect(zone).toHaveClass('ui-file--over');
    fireEvent.drop(zone, { dataTransfer });
    expect(zone).not.toHaveClass('ui-file--over');
    expect(onFiles).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'a.png' }),
    ]);
    expect(
      screen.getByRole('button', { name: 'Attachment: Choose file' }),
    ).toBeInTheDocument();
  });

  test('uploading shows the file name and a labelled progress bar', () => {
    render(
      <FileInput
        aria-label="Attachment"
        onFiles={() => {}}
        uploading={{ name: 'a.png', progress: 0.4 }}
      />,
    );
    expect(screen.getByText('a.png')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Uploading a.png' }),
    ).toHaveAttribute('value', '0.4');
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('aria-describedby adds a description outside a Field', () => {
    render(
      <>
        <FileInput
          aria-label="Preview"
          aria-describedby="err"
          hint="PNG"
          onFiles={() => {}}
        />
        <p id="err">Add a preview image.</p>
      </>,
    );
    expect(
      screen.getByRole('button', { name: 'Preview: Choose file' }),
    ).toHaveAccessibleDescription('PNG Add a preview image.');
  });

  test('focus moves to the progress bar while uploading and back to the button after', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <FileInput aria-label="Cover" onFiles={() => {}} />,
    );
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Cover: Choose file' }),
    ).toHaveFocus();

    rerender(
      <FileInput
        aria-label="Cover"
        onFiles={() => {}}
        uploading={{ name: 'a.png' }}
      />,
    );
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toContainElement(
      screen.getByRole('progressbar'),
    );

    rerender(<FileInput aria-label="Cover" onFiles={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'Cover: Choose file' }),
    ).toHaveFocus();
  });

  test('aria-invalid marks the button outside a Field, and a Field error marks it inside one', () => {
    render(
      <>
        <FileInput aria-label="Cover" aria-invalid onFiles={() => {}} />
        <Field label="Preview" error="Add a preview image.">
          <FileInput onFiles={() => {}} />
        </Field>
      </>,
    );
    expect(
      screen.getByRole('button', { name: 'Cover: Choose file' }),
    ).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByRole('button', { name: 'Preview Choose file' }),
    ).toHaveAttribute('aria-invalid', 'true');
  });
});
