import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { parseDoc, safePath, type DocStore } from "./doc.ts";

// The project's private Vercel Blob store. get() returns null only for a 404 and throws on every other failure.
export const blobStore: DocStore = {
  async read(path) {
    const res = await get(safePath(path), { access: "private", useCache: false });
    if (!res) return null;
    if (res.statusCode !== 200) throw new Error(`${path}: unexpected status ${res.statusCode}`);
    return parseDoc(path, await new Response(res.stream).text(), res.blob.etag);
  },
  async write(path, value, expect) {
    const body = JSON.stringify(value);
    const opts = { access: "private", addRandomSuffix: false, contentType: "application/json" } as const;
    try {
      await put(safePath(path), body, expect === null ? { ...opts, allowOverwrite: false } : { ...opts, ifMatch: expect });
      return "ok";
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) return "conflict";
      // The SDK has no error class for "already exists", so a failed create counts as a conflict once the blob is there.
      if (expect === null && (await get(path, { access: "private", useCache: false }).catch(() => null))) return "conflict";
      throw e;
    }
  },
};
