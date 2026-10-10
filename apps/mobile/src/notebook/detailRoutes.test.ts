import { describe, expect, it } from 'vitest';
import { detailTab, notePath, taskPath } from './detailRoutes';

const ID = '01HTASKAAAAAAAAAAAAAAAAAAA';

describe('detail routes', () => {
  it('reads the tab from the route segments', () => {
    expect(detailTab(['(tabs)', 'today'])).toBe('today');
    expect(detailTab(['(tabs)', 'notes', '[id]'])).toBe('notes');
    expect(detailTab(['(tabs)', 'tasks', 'note', '[id]'])).toBe('tasks');
    expect(detailTab(['(tabs)', 'more'])).toBeNull();
    expect(detailTab(['search'])).toBeNull();
    expect(detailTab([])).toBeNull();
  });

  it('opens a task on the current tab’s stack', () => {
    expect(taskPath('today', ID)).toBe(`/today/task/${ID}`);
    expect(taskPath('upcoming', ID)).toBe(`/upcoming/task/${ID}`);
    expect(taskPath('notes', ID)).toBe(`/notes/task/${ID}`);
    expect(taskPath('tasks', ID)).toBe(`/tasks/${ID}`);
    expect(taskPath(null, ID)).toBe(`/tasks/${ID}`);
  });

  it('opens a note on the current tab’s stack', () => {
    expect(notePath('today', ID)).toBe(`/today/note/${ID}`);
    expect(notePath('upcoming', ID)).toBe(`/upcoming/note/${ID}`);
    expect(notePath('tasks', ID)).toBe(`/tasks/note/${ID}`);
    expect(notePath('notes', ID)).toBe(`/notes/${ID}`);
    expect(notePath(null, ID)).toBe(`/notes/${ID}`);
  });
});
