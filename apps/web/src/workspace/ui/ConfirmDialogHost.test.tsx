import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { ConfirmDialogHost } from './ConfirmDialogHost';
import { appConfirm } from '../confirmDialog';

const ask = (message: string, action?: string) => {
  let answer!: Promise<boolean>;
  act(() => {
    answer = appConfirm(message, action);
  });
  return answer;
};

test('asks in an alert dialog and answers with the clicked button', async () => {
  render(<ConfirmDialogHost />);
  const user = userEvent.setup();
  const answer = ask('Delete this task?', 'Delete');

  const dialog = screen.getByRole('alertdialog', { name: 'Delete this task?' });
  expect(dialog).toHaveTextContent('Delete this task?');
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  await expect(answer).resolves.toBe(true);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('Cancel, Escape and the backdrop all answer no', async () => {
  const { container } = render(<ConfirmDialogHost />);
  const user = userEvent.setup();

  let answer = ask('Leave?', 'Leave');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await expect(answer).resolves.toBe(false);

  answer = ask('Leave?', 'Leave');
  await user.keyboard('{Escape}');
  await expect(answer).resolves.toBe(false);

  answer = ask('Leave?', 'Leave');
  await user.click(
    document.body.querySelector<HTMLElement>('.confirm-dialog__scrim')!,
  );
  await expect(answer).resolves.toBe(false);
  expect(container).toBeEmptyDOMElement();
});

test('focus starts on the action, Tab stays inside, and focus returns after', async () => {
  render(
    <>
      <button type="button">Delete</button>
      <ConfirmDialogHost />
    </>,
  );
  const user = userEvent.setup();
  const opener = screen.getByRole('button', { name: 'Delete' });
  opener.focus();
  const answer = ask('Delete this page?', 'Delete');

  const dialog = screen.getByRole('alertdialog');
  const confirm = screen.getAllByRole('button', { name: 'Delete' }).at(-1)!;
  expect(dialog).toContainElement(confirm);
  expect(confirm).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.tab({ shift: true });
  expect(confirm).toHaveFocus();
  await user.keyboard('{Enter}');
  await expect(answer).resolves.toBe(true);
  expect(opener).toHaveFocus();
});

test('a newer question answers the open one no', async () => {
  render(<ConfirmDialogHost />);
  const first = ask('First?');
  const second = ask('Second?', 'Go');
  await expect(first).resolves.toBe(false);
  expect(screen.getByRole('alertdialog', { name: 'Second?' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Go' }));
  await expect(second).resolves.toBe(true);
});
