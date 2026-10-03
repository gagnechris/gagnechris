import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { EditorActionBar } from './EditorActionBar';

describe('EditorActionBar', () => {
  test('shows publish for drafts and wires actions', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    const onSave = vi.fn();
    render(
      <EditorActionBar
        leading={<h1>Home</h1>}
        status="draft"
        hasUnpublishedChanges={false}
        saveState="idle"
        dirty
        busy={false}
        viewLiveHref="/"
        onPublish={onPublish}
        onUnpublish={() => {}}
        onDiscard={() => {}}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View live' })).toHaveAttribute(
      'href',
      '/',
    );

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onPublish).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  test('shows discard / unpublish / publish changes when published with edits', () => {
    render(
      <EditorActionBar
        status="published"
        hasUnpublishedChanges
        saveState="saved"
        dirty={false}
        busy={false}
        onPublish={() => {}}
        onUnpublish={() => {}}
        onDiscard={() => {}}
        onSave={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Publish changes' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Discard changes' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Unpublish' }),
    ).toBeInTheDocument();
  });
});
