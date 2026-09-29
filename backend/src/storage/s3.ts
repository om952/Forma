import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "../config/env";
import type { FileStorage } from "./index";
import { downloadNameFor } from "./keys";

/** Long enough to start a download, short enough that a leaked link dies. */
const SIGNED_URL_TTL_SECONDS = 60;

export const createS3Storage = (): FileStorage => {
  const bucket = env.S3_BUCKET;

  if (!bucket) {
    // Unreachable: config validation requires it for this driver.
    throw new Error("S3_BUCKET is not set");
  }

  const client = new S3Client({
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    // Newer SDKs add CRC checksums to every request by default, which some
    // S3-compatible stores (R2, older MinIO) reject. Only send them where the
    // API demands one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentDisposition: "attachment",
          CacheControl: "private, max-age=300",
        })
      );
    },

    async send(key, res) {
      // The object is not checked for existence first: that would cost a round
      // trip on every download, and a missing key already gets a 404 from the
      // bucket at the other end of the redirect.
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${downloadNameFor(key)}"`,
        }),
        { expiresIn: SIGNED_URL_TTL_SECONDS }
      );

      // The redirect target expires, so it must never be cached.
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, url);
      return true;
    },
  };
};
