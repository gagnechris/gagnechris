import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  createNoteTemplate,
  deleteNoteTemplate,
  fetchNoteTemplate,
  fetchNoteTemplates,
  updateNoteTemplate,
  type CreateNoteTemplateRequest,
  type NoteTemplate,
} from './api.js';
import { preferNewerByVersion, setDetail, upsertById } from './cache.js';
import { createVersionedResource } from './createVersionedResource.js';
import { queryKeys } from './keys.js';

export type NoteTemplateResourceParams = { id: string };

export const setCachedNoteTemplate = (
  queryClient: QueryClient,
  template: NoteTemplate,
): void => {
  setDetail(queryClient, queryKeys.noteTemplates.detail(template.id), template);
  queryClient.setQueryData<NoteTemplate[]>(
    queryKeys.noteTemplates.list(),
    (prev) => prev && upsertById(prev, template, preferNewerByVersion),
  );
};

export const noteTemplateResource = createVersionedResource<
  NoteTemplate,
  NoteTemplateResourceParams
>({
  queryKey: ({ id }) => queryKeys.noteTemplates.detail(id),
  fetch: (client, { id }) => fetchNoteTemplate(client, id),
  update: (client, { id }, body) =>
    updateNoteTemplate(client, id, {
      version: body.version,
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.bodyMarkdown === 'string'
        ? { bodyMarkdown: body.bodyMarkdown }
        : {}),
    }),
  setCache: setCachedNoteTemplate,
  tooLargeMessage: 'This template is over the 10 KB limit.',
});

/** Every template, oldest first. */
export const useNoteTemplatesQuery = (enabled = true) => {
  const getClient = useGetApiClient();
  return useQuery({
    queryKey: queryKeys.noteTemplates.list(),
    queryFn: () => fetchNoteTemplates(getClient()),
    enabled,
  });
};

export const useCreateNoteTemplateMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateNoteTemplateRequest) =>
      createNoteTemplate(getClient(), body),
    onSuccess: (template) => setCachedNoteTemplate(queryClient, template),
  });
};

export const useDeleteNoteTemplateMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      deleteNoteTemplate(getClient(), id, version),
    onSuccess: (_, { id }) => {
      queryClient.setQueryData<NoteTemplate[]>(
        queryKeys.noteTemplates.list(),
        (prev) => prev?.filter((t) => t.id !== id),
      );
      queryClient.removeQueries({
        queryKey: queryKeys.noteTemplates.detail(id),
      });
    },
  });
};
