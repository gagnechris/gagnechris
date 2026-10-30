import { areaChoices, expect, pickArea, test } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

const FRIDAY_MORNING = new Date('2026-10-02T09:00:00-04:00');

test('an area added in Settings gets its own daily note and tasks, keeps them when renamed, and stops at four', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  await seed.blankDailyTemplates();
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/settings/areas`);
  const newName = page.getByRole('textbox', { name: 'New area' });
  const add = page.getByRole('button', { name: 'Add area' });
  await newName.fill('Family');
  await add.click();
  await expect(page.getByRole('textbox', { name: 'Area 3' })).toHaveValue(
    'Family',
  );

  await page.goto(`${apps.notebook}/today?area=family`);
  await expect
    .poll(() => areaChoices(page))
    .toEqual(['Work', 'Personal', 'Family']);
  await expect(page.getByText('Family notebook · Today')).toBeVisible();
  const editor = page.getByRole('textbox', { name: 'Note body' });
  await editor.click();
  await page.keyboard.type('School pickup');
  const familyDaily = async () =>
    (
      await seed.api.GET('/api/notebook/notes/daily/{area}/{date}', {
        params: { path: { area: 'family', date: '2026-10-02' } },
      })
    ).data;
  await expect
    .poll(async () => (await familyDaily())?.bodyMarkdown)
    .toBe('School pickup');

  await page.goto(`${apps.notebook}/tasks?area=family`);
  await expect(page.getByText('New tasks go to Family')).toBeVisible();
  const quickAdd = page.getByRole('combobox', { name: 'Quick add task' });
  await quickAdd.fill(`${prefix} book dentist`);
  await quickAdd.press('Enter');
  await expect(quickAdd).toHaveValue('');
  await pickArea(page, 'Family');
  const open = page.getByRole('list', { name: 'Open tasks' });
  await expect(open.getByText(`${prefix} book dentist`)).toBeVisible();
  await expect(open.getByText('Family')).toBeVisible();

  await page.goto(`${apps.notebook}/settings/areas`);
  const third = page.getByRole('textbox', { name: 'Area 3' });
  await third.fill('Kids');
  await third.press('Enter');
  await expect(third).toHaveValue('Kids');
  await page.goto(`${apps.notebook}/tasks`);
  await expect
    .poll(() => areaChoices(page))
    .toEqual(['All areas', 'Work', 'Personal', 'Kids']);
  await pickArea(page, 'Kids');
  await expect(open.getByText(`${prefix} book dentist`)).toBeVisible();
  await expect(open.getByText('Kids')).toBeVisible();
  expect((await familyDaily())?.bodyMarkdown).toBe('School pickup');

  await page.goto(`${apps.notebook}/settings/areas`);
  await newName.fill('Side');
  await add.click();
  await expect(page.getByRole('textbox', { name: 'Area 4' })).toHaveValue(
    'Side',
  );
  await expect(newName).toBeDisabled();
  await expect(add).toBeDisabled();
  await expect(
    page.getByText('You can have up to 4 areas. Remove one to add another.'),
  ).toBeVisible();
});

test('on a phone each area keeps its move and remove buttons beside its name', async ({
  page,
  apps,
  signIn,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn();
  await page.goto(`${apps.notebook}/settings/areas`);
  const rows = page.getByRole('list', { name: 'Areas' }).getByRole('listitem');
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    const name = await row.getByRole('textbox').boundingBox();
    const remove = await row
      .getByRole('button', { name: /^Remove / })
      .boundingBox();
    expect(remove!.x).toBeGreaterThan(name!.x + name!.width - 1);
    expect(remove!.y).toBeLessThan(name!.y + name!.height);
    expect(remove!.x + remove!.width).toBeLessThanOrEqual(390);
  }
});
