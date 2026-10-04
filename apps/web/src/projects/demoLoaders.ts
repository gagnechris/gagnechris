import type { ComponentType } from 'react';
import type { ProjectDemo, ProjectPageView } from '@gagnechris/shared';

export type ProjectDemoProps = { project: ProjectPageView };

type DemoModule = { default: ComponentType<ProjectDemoProps> };

/**
 * Each demo is its own lazy chunk under `src/demos/<id>/`, loaded only by a
 * page whose `demo` names it; `check:web-shells` fails the build if one is
 * reachable from the entry. A demo with no loader keeps its preview.
 */
export const PROJECT_DEMO_LOADERS: Partial<
  Record<ProjectDemo, () => Promise<DemoModule>>
> = {};
