import { z } from "zod";

import { idSchema } from "./common";

/**
 * Shape only. Whether the address is safe to call (not internal, not a
 * private range) is decided by `validateWebhookUrl` in utils/ssrf.ts.
 */
const webhookUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "must be an http or https URL");

export const createWebhookBody = z.object({ formId: idSchema, url: webhookUrlSchema });

export const listWebhooksQuery = z.object({ formId: idSchema });

export const updateWebhookBody = z
  .object({
    url: webhookUrlSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => body.url !== undefined || body.isActive !== undefined, {
    message: "send url, isActive or both",
  });
