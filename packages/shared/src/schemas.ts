import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const HealthResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.literal('gagnechris-api'),
  })
  .openapi('HealthResponse');

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const AdminMeResponseSchema = z
  .object({
    sub: z.string().min(1).openapi({ description: 'Cognito user sub' }),
    email: z.string().email().optional().openapi({ description: 'Verified email when present' }),
    username: z.string().optional().openapi({ description: 'Cognito username claim' }),
  })
  .openapi('AdminMeResponse');

export type AdminMeResponse = z.infer<typeof AdminMeResponseSchema>;

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
  })
  .openapi('ErrorResponse');

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
