import {
  ApiError,
  asMutateResult,
  type CreatePostRequest,
  type ExpectedVersionRequest,
  type Home,
  type MutateResult,
  type Post,
  type Resume,
  type UpdateHomeRequest,
  type UpdatePostRequest,
  type UpdateResumeRequest,
} from '@gagnechris/app-core';

/**
 * Re-exports types + ApiError for admin pages. Call sites must use
 * `useGetApiClient()` / resource hooks — no createApiClient() wrappers (CHR-158).
 */
export {
  ApiError,
  asMutateResult,
  type CreatePostRequest,
  type ExpectedVersionRequest,
  type Home,
  type MutateResult,
  type Post,
  type Resume,
  type UpdateHomeRequest,
  type UpdatePostRequest,
  type UpdateResumeRequest,
};
