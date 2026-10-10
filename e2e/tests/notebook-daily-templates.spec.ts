import { expect, test } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

const FRIDAY_MORNING = new Date('2026-10-02T09:00:00-04:00');

test('a new day starts from the area’s template and is saved only once typed into', async ({
  page,
  apps,
  signIn,
  seed,
}) => {
  await seed.dailyTemplate('work', '## Focus for {{weekday}}\n');
  await page.clock.setFixedTime(FRIDAY_MORNING);
  await signIn();
  await page.goto(`${apps.notebook}/today`);

  const editor = page.getByRole('textbox', { name: 'Note body' });
  await expect(editor).toContainText('Focus for Friday');
  await expect(page.getByRole('note')).toContainText(
    'Started from your Work template.',
  );
  const daily = async () => {
    const { data } = await seed.api.GET(
      '/api/notebook/notes/daily/{area}/{date}',
      { params: { path: { area: 'work', date: '2026-10-02' } } },
    );
    return data;
  };
  expect(await daily()).toMatchObject({ exists: false });

  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('Ship the release');
  await expect
    .poll(async () => (await daily())?.bodyMarkdown)
    .toBe('## Focus for Friday\nShip the release');
  await expect(page.getByRole('note')).toHaveCount(0);
});
