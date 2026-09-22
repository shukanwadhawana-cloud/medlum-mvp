import { mkdir, writeFile, readFile, unlink, access } from "fs/promises";
import path from "path";
import type { StorageProvider, StoredObjectMeta } from "./types";

function rootDir() {
  return process.env.STORAGE_LOCAL_PATH || path.join(process.cwd(), ".medlum-storage");
}

export function createLocalStorageProvider(): StorageProvider {
  return {
    name: "local",
    async upload(key, data, mimeType): Promise<StoredObjectMeta> {
      const full = path.join(rootDir(), key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, data);
      return { key, sizeBytes: data.length, mimeType };
    },
    async getObject(key) {
      const full = path.join(rootDir(), key);
      try {
        await access(full);
        const data = await readFile(full);
        return { data, mimeType: "application/octet-stream" };
      } catch {
        return null;
      }
    },
    async delete(key) {
      const full = path.join(rootDir(), key);
      try {
        await unlink(full);
      } catch {
        /* ignore */
      }
    },
  };
}
