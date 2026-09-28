import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import {
  asMutateResult,
  discardHome,
  fetchHome,
  publishHome,
  unpublishHome,
  updateHome,
  type ExpectedVersionRequest,
  type Home,
  type UpdateHomeRequest,
} from './api'
import { setCachedHome } from './cache'
import { queryKeys } from './keys'

export const useHomeQuery = () =>
  useQuery({
    queryKey: queryKeys.home(),
    queryFn: fetchHome,
  })

export const useSetHomeCache = () => {
  const queryClient = useQueryClient()
  return useCallback(
    (home: Home) => {
      setCachedHome(queryClient, home)
    },
    [queryClient],
  )
}

export const useUpdateHomeMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateHomeRequest) => updateHome(body),
    onSuccess: (home) => {
      setCachedHome(queryClient, home)
    },
  })
}

export const usePublishHomeMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) => publishHome(body),
    onSuccess: (home) => {
      setCachedHome(queryClient, home)
    },
  })
}

export const useUnpublishHomeMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) => unpublishHome(body),
    onSuccess: (home) => {
      setCachedHome(queryClient, home)
    },
  })
}

export const useDiscardHomeMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) => discardHome(body),
    onSuccess: (home) => {
      setCachedHome(queryClient, home)
    },
  })
}

export const useHomeLifecycleMutators = () => {
  const publish = usePublishHomeMutation()
  const unpublish = useUnpublishHomeMutation()
  const discard = useDiscardHomeMutation()

  const publishFn = useCallback(
    (body: ExpectedVersionRequest) =>
      asMutateResult(() => publish.mutateAsync(body)),
    [publish],
  )
  const unpublishFn = useCallback(
    (body: ExpectedVersionRequest) =>
      asMutateResult(() => unpublish.mutateAsync(body)),
    [unpublish],
  )
  const discardFn = useCallback(
    (body: ExpectedVersionRequest) =>
      asMutateResult(() => discard.mutateAsync(body)),
    [discard],
  )

  return {
    publish: publishFn,
    unpublish: unpublishFn,
    discard: discardFn,
  }
}
