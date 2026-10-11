import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { gaBootstrap } from '../../scripts/analyticsPlugin';
import RouteTracker from '../components/RouteTracker';
import { trackResumeView } from './analytics';

const ID = 'G-TEST123';

type Call = unknown[];
const dataLayer = () =>
  (window as unknown as { dataLayer: IArguments[] }).dataLayer.map(
    (args) => [...args] as Call,
  );

type Params = { send_page_view?: boolean; page_path?: string };

// gtag sends a page_view for every `config` unless told not to.
const isPageView = ([command, name, params]: Call) =>
  (command === 'config' && (params as Params)?.send_page_view !== false) ||
  (command === 'event' && name === 'page_view');

const pageViews = (calls: Call[]) => calls.filter(isPageView).length;

const resumeOrder = (calls: Call[]) => ({
  pageView: calls.findIndex(
    (call) => isPageView(call) && (call[2] as Params)?.page_path === '/resume',
  ),
  event: calls.findIndex(
    ([command, name, params]) =>
      command === 'event' &&
      name === 'view' &&
      (params as { event_category?: string }).event_category === 'resume',
  ),
});

const Resume = () => {
  useEffect(() => {
    trackResumeView();
  }, []);
  return <h1>Resume</h1>;
};

const App = () => (
  <RouteTracker>
    <Routes>
      <Route path="/" element={<Link to="/resume">Resume</Link>} />
      <Route path="/resume" element={<Resume />} />
    </Routes>
  </RouteTracker>
);

beforeEach(() => {
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', ID);
  // What /ga.js does on the published site.
  new Function(`${gaBootstrap(ID)}; window.gtag = gtag;`)();
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as { dataLayer?: unknown }).dataLayer;
  delete (window as { gtag?: unknown }).gtag;
});

test('a cold load counts one page view and a client navigation one more', async () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
  expect(pageViews(dataLayer())).toBe(1);

  await act(async () => screen.getByRole('link', { name: 'Resume' }).click());
  expect(pageViews(dataLayer())).toBe(2);
});

test.each([
  ['after a client navigation', '/', true],
  ['on a cold load', '/resume', false],
])(
  'the resume view event follows the /resume page view %s',
  async (_, start, navigate) => {
    render(
      <MemoryRouter initialEntries={[start]}>
        <App />
      </MemoryRouter>,
    );
    if (navigate) {
      await act(async () =>
        screen.getByRole('link', { name: 'Resume' }).click(),
      );
    }
    const { pageView, event } = resumeOrder(dataLayer());
    expect(pageView).toBeGreaterThan(-1);
    expect(event).toBeGreaterThan(pageView);
  },
);
