import fs from "node:fs";
import path from "node:path";

import { env } from "../config/env";
import type { FileStorage } from "./index";
import { downloadNameFor } from "./keys";

/** `backend/uploads` whether running from `src/` or `dist/`. */
export const defaultUploadDir = path.resolve(__dirname, "../../uploads");

export const createLocalStorage = (): FileStorage => {
  const root = path.resolve(env.UPLOAD_DIR ?? defaultUploadDir);

  const resolve = (key: string) => {
    const filePath = path.resolve(root, key);

    // Keys are validated before they get here; this is the second lock.
    if (!filePath.startsWith(root + path.sep)) {
      throw new Error(`Refusing a storage key outside the upload directory: ${key}`);
    }

    return filePath;
  };

  return {
    async put(key, body) {
      const filePath = resolve(key);

      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, body);
    },

    async send(key, res) {
      const filePath = resolve(key);

      try {
        await fs.promises.access(filePath, fs.constants.R_OK);
      } catch {
        return false;
      }

      // Sets Content-Type from the extension, which is always the detected
      // type — the upload route names files after what their bytes are.
      res.attachment(downloadNameFor(key));
      res.setHeader("Cache-Control", "private, max-age=300");

      await new Promise<void>((resolveSend, rejectSend) => {
        res.sendFile(filePath, { dotfiles: "deny" }, (error) =>
          error ? rejectSend(error) : resolveSend()
        );
      });

      return true;
    },
  };
};
