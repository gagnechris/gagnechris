import type { ComponentType } from 'react';
import {
  PROJECT_DEMO_IDS,
  type ProjectDemo,
  type ProjectPageView,
} from '@gagnechris/shared';

export type ProjectDemoProps = { project: ProjectPageView };

type DemoModule = { default: ComponentType<ProjectDemoProps> };

type DemoLoaders = Partial<Record<ProjectDemo, () => Promise<DemoModule>>>;

/**
 * Each demo is its own lazy chunk under `src/demos/<id>/`, loaded only by a
 * page whose `demo` names it; `check:web-shells` fails the build if one is
 * reachable from the entry. A demo with no loader keeps its preview.
 */
const loaders: DemoLoaders = {};

const fixtureId = import.meta.env.VITE_DEMO_FIXTURE;
// Dev server only (the e2e stack sets it): a test fixture stands in for one
// demo id. Builds drop this branch, fixture chunk included.
if (
  import.meta.env.DEV &&
  (PROJECT_DEMO_IDS as readonly string[]).includes(fixtureId ?? '')
) {
  loaders[fixtureId as ProjectDemo] = () =>
    import('../__tests__/fixtures/demo/FixtureDemo');
}

export const PROJECT_DEMO_LOADERS: DemoLoaders = loaders;
