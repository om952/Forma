/**
 * Where uploaded files live.
 *
 * Two drivers behind one interface: `local` writes to disk (development, or a
 * single server with a persistent volume), `s3` writes to any S3-compatible
 * bucket — AWS S3, Cloudflare R2, MinIO. Container platforms wipe the local
 * filesystem on every deploy, so production on one of those needs `s3`.
 *
 * Either way, files are reached through the API at `/api/files/<key>`, never
 * straight from the bucket. The bucket stays private, the link stored in a
 * response never changes if storage moves, and the API decides how the file
 * is served (always as a download).
 */

import type { Response } from "express";

import { env, publicApiUrl } from "../config/env";
import { createLocalStorage } from "./local";
import { createS3Storage } from "./s3";

export { buildFileKey, downloadNameFor, isValidFileKey } from "./keys";

export type FileStorage = {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /**
   * Sends the file as a download: streamed from disk, or a redirect to a
   * short-lived signed URL. Resolves false when there is no such file.
   */
  send(key: string, res: Response): Promise<boolean>;
};

/** The permanent link to a stored file, as saved in a form response. */
export const fileUrlFor = (key: string) => `${publicApiUrl}/api/files/${key}`;

export const storage: FileStorage =
  env.STORAGE_DRIVER === "s3" ? createS3Storage() : createLocalStorage();
