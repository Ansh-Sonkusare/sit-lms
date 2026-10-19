import "server-only";
import { get, put } from "@vercel/blob";

// Small JSON documents in the project's private Vercel Blob store; memory-only when no token is set.
const mem = new Map<string, unknown>();

export async function readJson<T>(path: string): Promise<T | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return (mem.get(path) as T) ?? null;
  const res = await get(path, { access: "private", useCache: false }).catch(() => null);
  if (!res || res.statusCode !== 200) return null;
  return (await new Response(res.stream).json()) as T;
}

export async function writeJson(path: string, value: unknown) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return void mem.set(path, value);
  await put(path, JSON.stringify(value), { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json" });
}
