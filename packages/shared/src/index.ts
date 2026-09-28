/**
 * Platform-neutral domain entry for `@gagnechris/shared`.
 * No marked, HTML renderers, OpenAPI, or Node DynamoDB helpers (CHR-139).
 */
export {
  API_SERVICE_NAME,
  POWERTOOLS_METRICS_NAMESPACE,
  PUBLISHER_SERVICE_NAME,
} from './constants.js';
export {
  SITE_AUTHOR_NAME,
  SITE_GITHUB_URL,
  SITE_LINKEDIN_URL,
  SITE_PROFILE_IMAGE_SRC,
} from './site-config.js';
export {
  AdminMeResponseSchema,
  ConflictErrorResponseSchema,
  ContactRequestSchema,
  ContactResponseSchema,
  CreatePostRequestSchema,
  ErrorResponseSchema,
  ExpectedVersionRequestSchema,
  HealthResponseSchema,
  HomeSchema,
  MEDIA_CONTENT_TYPES,
  MEDIA_MAX_BYTES,
  MediaContentTypeSchema,
  MediaUploadUrlRequestSchema,
  MediaUploadUrlResponseSchema,
  PostListResponseSchema,
  PostSchema,
  PostSeoSchema,
  PostStatusSchema,
  PublishableFieldsSchema,
  ResumeContentSchema,
  ResumeDownloadNotifyRequestSchema,
  ResumeDownloadNotifyResponseSchema,
  ResumeEducationSchema,
  ResumeExperienceSchema,
  ResumeSchema,
  UpdateHomeRequestSchema,
  UpdatePostRequestSchema,
  UpdateResumeRequestSchema,
  type AdminMeResponse,
  type ConflictErrorResponse,
  type ContactRequest,
  type ContactResponse,
  type CreatePostRequest,
  type ErrorResponse,
  type ExpectedVersionRequest,
  type HealthResponse,
  type Home,
  type MediaContentType,
  type MediaUploadUrlRequest,
  type MediaUploadUrlResponse,
  type Post,
  type PostListResponse,
  type PostSeo,
  type PostStatus,
  type PublishableFields,
  type Resume,
  type ResumeContent,
  type ResumeDownloadNotifyRequest,
  type ResumeDownloadNotifyResponse,
  type ResumeEducation,
  type ResumeExperience,
  type UpdateHomeRequest,
  type UpdatePostRequest,
  type UpdateResumeRequest,
} from './schemas.js';
export { DEFAULT_HOME } from './home-default.js';
export { DEFAULT_RESUME } from './resume-default.js';
export { MAX_SLUG_LENGTH, slugify } from './slugify.js';
export { formatPostDate, postDateAttribute } from './post-date.js';
export { textExcerpt } from './excerpt.js';
