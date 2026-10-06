import { expect, test } from '../fixtures';

test('tasks are added, completed and filtered in each area', async ({
  page,
  apps,
  signIn,
  prefix,
}) => {
  await signIn();
  await page.goto(`${apps.notebook}/tasks`);
  const quickAdd = page.getByRole('combobox', { name: 'Quick add task' });
  const open = page.getByRole('list', { name: 'Open tasks' });
  const add = async (text: string) => {
    await quickAdd.fill(text);
    await quickAdd.press('Enter');
    await expect(quickAdd).toHaveValue('');
  };

  await add(`${prefix} work urgent !high`);
  await add(`${prefix} work later`);
  await expect(open.getByText(`${prefix} work urgent`)).toBeVisible();
  await expect(open.getByText(`${prefix} work later`)).toBeVisible();

  const area = page.getByRole('radiogroup', { name: 'Notebook area' });
  await area.getByRole('radio', { name: 'Personal' }).click();
  await expect(page).toHaveURL(/[?&]area=personal/);
  await add(`${prefix} personal errand`);
  await expect(open.getByText(`${prefix} personal errand`)).toBeVisible();
  await expect(page.getByText(`${prefix} work urgent`)).toHaveCount(0);

  await area.getByRole('radio', { name: 'Work' }).click();
  await expect(open.getByText(`${prefix} work later`)).toBeVisible();
  await expect(page.getByText(`${prefix} personal errand`)).toHaveCount(0);

  await page
    .getByRole('checkbox', { name: `Complete ${prefix} work later` })
    .click();
  await expect(open.getByText(`${prefix} work later`)).toHaveCount(0);
  await page.reload();
  await expect(open.getByText(`${prefix} work urgent`)).toBeVisible();
  await expect(page.getByText(`${prefix} work later`)).toHaveCount(0);
  await page.locator('summary', { hasText: 'Completed' }).click();
  await expect(
    page
      .getByRole('list', { name: 'Completed tasks' })
      .getByText(`${prefix} work later`),
  ).toBeVisible();

  await page
    .getByRole('combobox', { name: 'Filter by priority' })
    .selectOption('high');
  await expect(open.getByText(`${prefix} work urgent`)).toBeVisible();
  await expect(page.getByText(`${prefix} work later`)).toHaveCount(0);

  await page
    .getByRole('combobox', { name: 'Filter by priority' })
    .selectOption('');
  await page
    .getByRole('combobox', { name: 'Filter by status' })
    .selectOption('done');
  await expect(
    page
      .getByRole('list', { name: 'Completed tasks' })
      .getByText(`${prefix} work later`),
  ).toBeVisible();
  await expect(page.getByText(`${prefix} work urgent`)).toHaveCount(0);
});

test('a deadline and a show-on date are set apart and both round-trip', async ({
  page,
  apps,
  signIn,
  prefix,
}) => {
  await signIn();
  await page.goto(`${apps.notebook}/tasks`);
  const quickAdd = page.getByRole('combobox', { name: 'Quick add task' });
  await quickAdd.fill(`${prefix} file taxes due:2099-04-15 @2099-04-01 `);
  await quickAdd.press('Enter');
  await expect(quickAdd).toHaveValue('');

  const row = page
    .getByRole('list', { name: 'Open tasks' })
    .getByRole('listitem')
    .filter({ hasText: `${prefix} file taxes` });
  await expect(row.getByText('due Apr 15')).toBeVisible();
  await row
    .getByRole('link', { name: new RegExp(`${prefix} file taxes`) })
    .click();

  const showOn = page.getByLabel('Show on');
  const deadline = page.getByLabel('Deadline');
  await expect(showOn).toHaveValue('2099-04-01');
  await expect(deadline).toHaveValue('2099-04-15');

  await deadline.fill('2099-04-20');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.admin-save-indicator')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByLabel('Deadline')).toHaveValue('2099-04-20');
  await expect(page.getByLabel('Show on')).toHaveValue('2099-04-01');

  await page.getByLabel('Show on').fill('');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.admin-save-indicator')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByLabel('Show on')).toHaveValue('');
  await expect(page.getByLabel('Deadline')).toHaveValue('2099-04-20');
});
