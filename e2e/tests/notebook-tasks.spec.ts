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
