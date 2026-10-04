import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { projectPageView } from '@gagnechris/shared/render';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import { DEMO_NOTE } from '../kit/demo/DemoFrame';
import ProjectDemoSlot from './ProjectDemoSlot';

const load = vi.hoisted(() => vi.fn());

vi.mock('./demoLoaders', () => ({
  PROJECT_DEMO_LOADERS: { posts: load },
}));

const posts = SAMPLE_PROJECTS.find((p) => p.slug === 'posts')!;
const project = projectPageView(
  { ...posts, previewImage: '/media/projects/posts.png' },
  [],
);

let intersect: (isIntersecting: boolean) => void;

beforeEach(() => {
  load.mockReset();
  load.mockImplementation(
    () => import('../__tests__/fixtures/demo/FixtureDemo'),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = (isIntersecting) => cb([{ isIntersecting }]);
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderSlot = () =>
  render(
    <MemoryRouter>
      <ProjectDemoSlot project={project} />
    </MemoryRouter>,
  );

const preview = () => document.querySelector('.project-preview--image img');

describe('ProjectDemoSlot', () => {
  test('shows the preview and loads no demo until the slot nears the viewport', async () => {
    renderSlot();
    expect(preview()).not.toBeNull();
    act(() => intersect(false));
    expect(load).not.toHaveBeenCalled();

    act(() => intersect(true));
    expect(load).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(DEMO_NOTE)).toBeInTheDocument();
    expect(preview()).toBeNull();
  });

  test('a click on the slot loads the demo', async () => {
    renderSlot();
    fireEvent.pointerDown(document.querySelector('.project-demo__stage')!);
    expect(await screen.findByText(DEMO_NOTE)).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('keeps the preview when the chunk fails to load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    load.mockRejectedValue(new Error('offline'));
    renderSlot();
    act(() => intersect(true));
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(preview()).not.toBeNull();
    error.mockRestore();
  });
});

describe('a demo in the frame', () => {
  const loaded = async () => {
    renderSlot();
    act(() => intersect(true));
    await screen.findByText(DEMO_NOTE);
  };
  const titles = () =>
    screen
      .getAllByRole('checkbox')
      .map((box) => [
        box.getAttribute('aria-label'),
        (box as HTMLInputElement).checked,
      ]);

  test('Reset restores the seed state and clears typed input', async () => {
    const user = userEvent.setup();
    await loaded();
    const seeded = titles();
    expect(seeded).toEqual([
      ['Complete Seeded open task', false],
      ['Reopen Seeded done task', true],
    ]);

    await user.click(
      screen.getByRole('checkbox', { name: 'Complete Seeded open task' }),
    );
    const input = screen.getByRole('textbox', { name: /Add a task/ });
    await user.type(input, 'Call Sam !high{Enter}');
    await user.type(input, 'half typed');
    expect(titles()).toHaveLength(3);
    expect(screen.getByText('high')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(titles()).toEqual(seeded);
    expect(screen.getByRole('textbox', { name: /Add a task/ })).toHaveValue('');
  });

  test('the keyboard reaches every control and Reset, and Space toggles', async () => {
    const user = userEvent.setup();
    await loaded();
    const order = [
      screen.getByRole('button', { name: 'Reset' }),
      screen.getByRole('textbox', { name: /Add a task/ }),
      screen.getByRole('button', { name: 'Add' }),
      screen.getByRole('checkbox', { name: 'Complete Seeded open task' }),
      screen.getByRole('checkbox', { name: 'Reopen Seeded done task' }),
    ];
    for (const control of order) {
      await user.tab();
      expect(control).toHaveFocus();
    }
    await user.keyboard(' ');
    expect(
      screen.getByRole('checkbox', { name: 'Complete Seeded done task' }),
    ).not.toBeChecked();

    await user.tab({ shift: true });
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(order[0]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(
      screen.getByRole('checkbox', { name: 'Reopen Seeded done task' }),
    ).toBeChecked();
    expect(order[0]).toHaveFocus();
  });
});
