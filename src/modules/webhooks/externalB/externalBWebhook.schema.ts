import { z } from 'zod';

export const externalBWebhookEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  createdAt: z.union([z.string().datetime(), z.string().min(1)]).optional(),
  data: z.unknown().optional(),
});

export type ExternalBWebhookEvent = z.infer<typeof externalBWebhookEventSchema>;
