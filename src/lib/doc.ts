// Small JSON documents with etags, so a read-modify-write can tell when someone else wrote in between.
export type Doc = { value: unknown; etag: string };

export interface DocStore {
  // null only when nothing is stored at `path`; any other failure throws.
  read(path: string): Promise<Doc | null>;
  // expect: the etag of the version this write replaces, or null to create a document that must not exist yet.
  write(path: string, value: unknown, expect: string | null): Promise<"ok" | "conflict">;
}

export class StoreError extends Error {}

export const parseDoc = (path: string, text: string, etag: string): Doc => {
  try {
    return { value: JSON.parse(text), etag };
  } catch {
    throw new StoreError(`${path}: stored document is not valid JSON`);
  }
};

// Keeps JSON text, not objects, so callers can't change what is stored by mutating what they read.
export function memoryStore(): DocStore & { raw: Map<string, { text: string; etag: string }> } {
  const raw = new Map<string, { text: string; etag: string }>();
  let n = 0;
  return {
    raw,
    async read(path) {
      const hit = raw.get(path);
      return hit ? parseDoc(path, hit.text, hit.etag) : null;
    },
    async write(path, value, expect) {
      const hit = raw.get(path);
      if (expect === null ? hit : hit?.etag !== expect) return "conflict";
      raw.set(path, { text: JSON.stringify(value), etag: `"m${++n}"` });
      return "ok";
    },
  };
}

// What a change decides for the document it was given: `write` replaces it; without `write` nothing is written.
export type Change<R> = { result: R; write?: unknown };
export type Updated<R> = { ok: true; result: R } | { ok: false; reason: "conflict" | "unavailable" };

// Reads fresh, applies `change`, and writes only if nobody wrote since the read. On a conflict it starts over
// from a new read, so `change` must be a function of the document alone. Errors thrown by `change` propagate,
// except StoreError, which means the stored document can't be used.
export async function update<R>(store: DocStore, path: string, change: (current: Doc | null) => Change<R>, tries = 3): Promise<Updated<R>> {
  for (let i = 0; i < tries; i++) {
    let current: Doc | null;
    try {
      current = await store.read(path);
    } catch (e) {
      console.error(`${path}: read failed`, e);
      return { ok: false, reason: "unavailable" };
    }
    let c: Change<R>;
    try {
      c = change(current);
    } catch (e) {
      if (!(e instanceof StoreError)) throw e;
      console.error(e.message);
      return { ok: false, reason: "unavailable" };
    }
    if (!("write" in c)) return { ok: true, result: c.result };
    let wrote: "ok" | "conflict";
    try {
      wrote = await store.write(path, c.write, current?.etag ?? null);
    } catch (e) {
      console.error(`${path}: write failed`, e);
      return { ok: false, reason: "unavailable" };
    }
    if (wrote === "ok") return { ok: true, result: c.result };
  }
  return { ok: false, reason: "conflict" };
}
