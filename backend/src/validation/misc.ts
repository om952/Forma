import { z } from "zod";

import { idSchema, timeZoneSchema } from "./common";

export const createSubscriptionBody = z.object({
  plan: z.enum(["monthly", "yearly"]).default("monthly"),
});

/** 5 MB of file is at most ~6.7 MB of base64. */
const MAX_BASE64_LENGTH = Math.ceil((5 * 1024 * 1024 * 4) / 3) + 4;

export const uploadBody = z.object({
  formId: idSchema,
  fileName: z.string().min(1, "is required").max(255),
  fileData: z
    .string()
    .min(1, "is required")
    .max(MAX_BASE64_LENGTH, "the file is larger than 5MB"),
});

/** `<uuid>_<name>.<ext>` as the upload route stores it; never a path. */
export const fileParams = z.object({
  formId: idSchema,
  fileName: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/, "is not a valid file name"),
});

export const ANALYTICS_RANGES = [7, 30, 90] as const;

export const analyticsQuery = z.object({
  days: z.coerce
    .number()
    .refine((days) => (ANALYTICS_RANGES as readonly number[]).includes(days), "must be 7, 30 or 90")
    .default(30),
  timeZone: timeZoneSchema.default("UTC"),
});

export const fieldReachedBody = z.object({ fieldId: idSchema });
