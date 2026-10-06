import { expect, test } from '../fixtures';

test('a Full Admin invites someone, changes their access, removes and restores them', async ({
  page,
  apps,
  prefix,
  signIn,
}) => {
  await signIn();
  await page.goto(`${apps.admin}/`);
  await page.getByRole('link', { name: 'Users & access' }).click();
  await expect(
    page.getByRole('heading', { name: 'Users & access' }),
  ).toBeVisible();

  const email = `${prefix}-friend@e2e.test`;
  const invite = page.getByRole('button', { name: 'Invite user' });
  await invite.click();
  const dialog = page.getByRole('dialog', { name: 'Invite user' });
  await expect(
    dialog.getByRole('radio', { name: /Notebook only/ }),
  ).toHaveAttribute('aria-checked', 'true');
  await dialog.getByLabel('Name').fill('Friend Example');
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText(`Invite sent to ${email}.`)).toBeVisible();
  await expect(invite).toBeFocused();

  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toContainText('Invited');
  await expect(row).toContainText('Notebook only');

  const edit = row.getByRole('button', {
    name: 'Edit access for Friend Example',
  });
  await edit.click();
  const panel = page.getByRole('dialog', {
    name: 'Edit access for Friend Example',
  });
  await panel.getByRole('radio', { name: /Notebook only/ }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(panel.getByRole('radio', { name: /Public CMS/ })).toBeFocused();
  await expect(panel).toContainText(
    'Friend gains Admin. Friend loses Notebook.',
  );
  await panel.getByRole('button', { name: 'Save access' }).click();
  await expect(
    page.getByText('Friend Example now has Public CMS access.'),
  ).toBeVisible();
  await expect(row).toContainText('Public CMS');
  await expect(edit).toBeFocused();

  await edit.click();
  await panel.getByRole('button', { name: 'Remove' }).click();
  await expect(row).toContainText('Removed · notes kept');
  await panel.getByRole('button', { name: 'Restore' }).click();
  await expect(
    page.getByText('Friend Example has access again.'),
  ).toBeVisible();
  await expect(row).toContainText('Public CMS');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(edit).toBeFocused();
});

test('a Public CMS user never sees Settings and gets No access at the URL', async ({
  page,
  apps,
  users,
  signIn,
}) => {
  await signIn({ ...users.owner, groups: ['site-admin'] });
  await page.goto(`${apps.admin}/`);
  await expect(page.getByRole('link', { name: 'Posts' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Users & access' })).toHaveCount(
    0,
  );
  await page.goto(`${apps.admin}/settings/users`);
  await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();
});
