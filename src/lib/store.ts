import "server-only";
import { blobStore } from "./blob-store.ts";
import { memoryStore } from "./doc.ts";

// Memory-only when no token is set, with the same etags and conflicts as the blob store.
export const store = process.env.BLOB_READ_WRITE_TOKEN ? blobStore : memoryStore();
