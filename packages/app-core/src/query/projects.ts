import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '@gagnechris/api-client';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  ApiError,
  createProject,
  deleteProject,
  discardProject,
  fetchProject,
  fetchProjects,
  publishProject,
  unpublishProject,
  updateProject,
  type CreateProjectRequest,
  type Project,
  type UpdateProjectRequest,
} from './api.js';
import { setCachedProject } from './cache.js';
import { createDraftPublishResource } from './createDraftPublishResource.js';
import { useDeleteEntityMutation } from './createVersionedResource.js';
import { queryKeys } from './keys.js';

export type ProjectResourceParams = { id: string };

export const projectResource = createDraftPublishResource<
  Project,
  ProjectResourceParams
>({
  queryKey: ({ id }) => queryKeys.projects.detail(id),
  fetch: (client, { id }) => fetchProject(client, id),
  update: (client, { id }, body) =>
    updateProject(client, id, body as UpdateProjectRequest),
  publish: (client, { id }, body) => publishProject(client, id, body),
  unpublish: (client, { id }, body) => unpublishProject(client, id, body),
  discard: (client, { id }, body) => discardProject(client, id, body),
  setCache: setCachedProject,
});

export const useProjectsQuery = () => {
  const getClient = useGetApiClient();
  return useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: () => fetchProjects(getClient()),
  });
};

export type NewProjectInput = Pick<CreateProjectRequest, 'name'> &
  Partial<Omit<CreateProjectRequest, 'name'>>;

export const newProjectRequest = (
  input: NewProjectInput,
): CreateProjectRequest => ({
  pitch: '',
  stage: 'idea',
  stageNote: '',
  bodyMarkdown: '',
  stack: [],
  links: [],
  order: 0,
  ...input,
});

export const useCreateProjectMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewProjectInput) =>
      createProject(getClient(), newProjectRequest(input)),
    onSuccess: (project) => {
      setCachedProject(queryClient, project);
    },
  });
};

export const useDeleteProjectMutation = () =>
  useDeleteEntityMutation(deleteProject, setCachedProject);

export const STARTER_PROJECTS: readonly NewProjectInput[] = [
  { name: 'Posts', slug: 'posts', stage: 'live', order: 1 },
  { name: 'Notebook', slug: 'notebook', stage: 'building', order: 2 },
  {
    name: 'Don’t Feed the Bears',
    slug: 'dont-feed-the-bears',
    stage: 'live',
    order: 3,
    href: '/dont-feed-the-bears',
  },
];

export type StarterProjectsResult = {
  created: Project[];
  skipped: string[];
};

/**
 * Creates each starter project as a draft, skipping slugs already in use.
 * A deleted project still holds its slug, so a `slug_taken` create also counts
 * as already there.
 */
export const createStarterProjects = async (
  client: ApiClient,
  existing: readonly Pick<Project, 'slug'>[],
): Promise<StarterProjectsResult> => {
  const taken = new Set(existing.map((p) => p.slug));
  const result: StarterProjectsResult = { created: [], skipped: [] };
  for (const starter of STARTER_PROJECTS) {
    const slug = starter.slug!;
    if (taken.has(slug)) {
      result.skipped.push(slug);
      continue;
    }
    try {
      result.created.push(
        await createProject(client, newProjectRequest(starter)),
      );
    } catch (err) {
      if (err instanceof ApiError && err.error === 'slug_taken') {
        result.skipped.push(slug);
        continue;
      }
      throw err;
    }
  }
  return result;
};

export const useCreateStarterProjectsMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const client = getClient();
      return createStarterProjects(client, await fetchProjects(client));
    },
    onSuccess: ({ created }) => {
      for (const project of created) setCachedProject(queryClient, project);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() }),
  });
};
