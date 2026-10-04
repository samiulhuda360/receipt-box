import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { BlobStore } from "../domain";

type Policy = { contentType: string; maxBytes: number; expires: number };

/**
 * A folder that behaves like the S3 bucket: uploads need a policy issued by createUpload (same key,
 * type and size rules as the presigned POST), and the local server calls `accept` when a form arrives.
 */
export class LocalBlobStore implements BlobStore {
  private policies = new Map<string, Policy>();

  constructor(
    private readonly root: string,
    private readonly baseUrl: string,
  ) {}

  private path(key: string) {
    const p = resolve(this.root, key);
    if (!p.startsWith(resolve(this.root))) throw new Error("bad key");
    return p;
  }

  async createUpload(key: string, contentType: string, maxBytes: number) {
    this.policies.set(key, { contentType, maxBytes, expires: Date.now() + 300_000 });
    return { url: `${this.baseUrl}/local-blob`, fields: { key, "Content-Type": contentType } };
  }

  /** What S3 would do with the POST: check the policy, then store the file. Returns an error message or null. */
  async accept(key: string, contentType: string, bytes: Uint8Array): Promise<string | null> {
    const policy = this.policies.get(key);
    if (!policy || policy.expires < Date.now()) return "No valid upload policy for this key";
    if (contentType !== policy.contentType) return "Content-Type does not match the policy";
    if (bytes.byteLength < 1 || bytes.byteLength > policy.maxBytes) return "File size is outside the allowed range";
    this.policies.delete(key);
    await mkdir(dirname(this.path(key)), { recursive: true });
    await writeFile(this.path(key), bytes);
    return null;
  }

  async signedGetUrl(key: string) {
    return `${this.baseUrl}/local-blob/${encodeURIComponent(key)}`;
  }

  async get(key: string) {
    return new Uint8Array(await readFile(this.path(key)));
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }

  file(key: string) {
    return join(this.root, key);
  }
}
