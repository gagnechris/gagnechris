import { expect, test } from '../fixtures';

// Friday 22:30 in New York is already Saturday in UTC.
test.use({ timezoneId: 'America/New_York' });

test('the @ date menu works from the keyboard and creates a task on that day', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-02T22:30:00-04:00'));
  await signIn();
  await page.goto(`${apps.notebook}/tasks`);

  const input = page.getByRole('combobox', { name: 'Quick add task' });
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.click();
  await page.keyboard.type(`${prefix} fonts @`);

  await expect(input).toHaveAttribute('aria-expanded', 'true');
  const listbox = page.getByRole('listbox', { name: 'Show this task on…' });
  await expect(listbox.getByRole('option')).toHaveText([
    /Tomorrow\s*Sat, Oct 3/,
    /Monday\s*Oct 5/,
    /Next week\s*Mon, Oct 5/,
    /Someday\s*No date, parked/,
    'Pick a date…',
  ]);
  await expect(
    page.getByRole('option', { name: 'Tomorrow, Sat, Oct 3' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('status')).toHaveText(/^5 date options\./);

  await page.keyboard.press('ArrowDown');
  const monday = page.getByRole('option', { name: 'Monday, Oct 5' });
  await expect(monday).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    (await monday.getAttribute('id'))!,
  );

  await page.keyboard.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toHaveValue(`${prefix} fonts @`);

  await page.keyboard.press('Backspace');
  await page.keyboard.type('@');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue(`${prefix} fonts @mon `);
  await expect(input).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.type('!high');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('checkbox', { name: `Complete ${prefix} fonts` }),
  ).toBeVisible();
  await expect(input).toHaveValue('');

  const { data } = await seed.api.GET('/api/notebook/tasks', {
    params: { query: { limit: 50 } },
  });
  const created = data?.items.find((t) => t.title === `${prefix} fonts`);
  expect(created).toMatchObject({
    startDate: '2026-10-05',
    someday: false,
    priority: 'high',
  });
});
