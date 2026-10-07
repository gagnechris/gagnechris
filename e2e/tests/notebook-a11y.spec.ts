import AxeBuilder from '@axe-core/playwright';
import { ulid } from 'ulid';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

test.use({ timezoneId: 'America/New_York' });

async function expectNoViolations(page: Page, view: string) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`,
    ),
    view,
  ).toEqual([]);
}

test('axe finds nothing on Today, Notes, Tasks, a task and the search palette', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.api.POST('/api/notebook/notes', {
    body: {
      id: ulid(),
      area: 'work',
      type: 'page',
      title: `${prefix} Planning`,
    },
  });
  const task = await seed.task({ title: `${prefix} Draft the plan` });

  await signIn();
  await page.goto(`${apps.notebook}/today`);
  await expect(page.getByRole('textbox', { name: 'Note body' })).toBeVisible();
  await page.getByText('Calendar', { exact: true }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  await expectNoViolations(page, 'Today');

  await page.goto(`${apps.notebook}/notes`);
  await expect(page.getByText(note.data!.title)).toBeVisible();
  await expectNoViolations(page, 'Notes');

  await page.goto(`${apps.notebook}/tasks`);
  await expect(page.getByText(task.title)).toBeVisible();
  await expectNoViolations(page, 'Tasks');

  await page.goto(`${apps.notebook}/tasks/${task.id}`);
  const linked = page.getByRole('combobox', { name: 'Linked note' });
  await expect(
    linked.locator('option', { hasText: note.data!.title }),
  ).toHaveCount(1);
  await expectNoViolations(page, 'Task');

  await page.keyboard.press('ControlOrMeta+k');
  const search = page.getByRole('combobox', { name: 'Search notes and tasks' });
  await search.fill('Planning');
  await expect(
    page.getByRole('listbox').getByRole('option').first(),
  ).toBeVisible();
  await expectNoViolations(page, 'Search palette');
});

test('the calendar and area switcher work from the keyboard, and the area rides in the URL', async ({
  page,
  apps,
  signIn,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-14T09:00:00-04:00'));
  await signIn();
  await page.goto(`${apps.notebook}/today`);
  await expect(page).toHaveURL(/[?&]area=work/);

  const area = page.getByRole('radiogroup', { name: 'Notebook area' });
  await area.getByRole('radio', { name: 'Work' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(area.getByRole('radio', { name: 'Personal' })).toBeFocused();
  await expect(page).toHaveURL(/[?&]area=personal/);

  await page.getByText('Calendar', { exact: true }).click();
  await page.getByRole('gridcell', { name: /October 14, 2026/ }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/[?&]date=2026-10-15/);
  await expect(page).toHaveURL(/[?&]area=personal/);
});

test('a task links to a note picked by title', async ({
  page,
  apps,
  signIn,
  seed,
  prefix,
}) => {
  const note = await seed.api.POST('/api/notebook/notes', {
    body: {
      id: ulid(),
      area: 'personal',
      type: 'page',
      title: `${prefix} Garden`,
    },
  });
  const task = await seed.task({ title: `${prefix} Order seeds` });

  await signIn();
  await page.goto(`${apps.notebook}/tasks/${task.id}`);
  await page
    .getByRole('combobox', { name: 'Linked note' })
    .selectOption({ label: note.data!.title });
  await page.keyboard.press('ControlOrMeta+s');

  await expect
    .poll(async () => {
      const { data } = await seed.api.GET('/api/notebook/tasks/{id}', {
        params: { path: { id: task.id } },
      });
      return data?.noteId;
    })
    .toBe(note.data!.id);
});
