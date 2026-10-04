import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { ReceiptStatus } from "@receipt-box/shared";

import type { ReceiptPatch, ReceiptRecord, ReceiptRepo } from "../domain";

const newestFirst = (a: ReceiptRecord, b: ReceiptRecord) => b.createdAt.localeCompare(a.createdAt);

/** In-memory repo for tests and local mode; with a file path it survives restarts of the dev server. */
export class MemoryRepo implements ReceiptRepo {
  private items = new Map<string, ReceiptRecord>();

  constructor(private readonly file?: string) {
    if (file && existsSync(file)) {
      for (const r of JSON.parse(readFileSync(file, "utf8")) as ReceiptRecord[]) this.items.set(this.key(r.userId, r.id), r);
    }
  }

  private key(userId: string, id: string) {
    return `${userId}#${id}`;
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify([...this.items.values()], null, 1));
  }

  async create(record: ReceiptRecord) {
    if (this.items.has(this.key(record.userId, record.id))) throw new Error("receipt already exists");
    this.items.set(this.key(record.userId, record.id), structuredClone(record));
    this.save();
  }

  async get(userId: string, id: string) {
    const r = this.items.get(this.key(userId, id));
    return r ? structuredClone(r) : null;
  }

  async update(userId: string, id: string, patch: ReceiptPatch, onlyIf?: ReceiptStatus[]) {
    const current = this.items.get(this.key(userId, id));
    if (!current || (onlyIf && !onlyIf.includes(current.status))) return null;
    const next = { ...current, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() };
    this.items.set(this.key(userId, id), next);
    this.save();
    return structuredClone(next);
  }

  async delete(userId: string, id: string) {
    const deleted = this.items.delete(this.key(userId, id));
    this.save();
    return deleted;
  }

  async listReviewed(userId: string, from: string, to: string) {
    return [...this.items.values()]
      .filter((r) => r.userId === userId && r.status === "REVIEWED" && r.date && r.date >= from && r.date <= to)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || newestFirst(a, b))
      .map((r) => structuredClone(r));
  }

  async listInbox(userId: string) {
    return [...this.items.values()]
      .filter((r) => r.userId === userId && r.status !== "REVIEWED")
      .sort(newestFirst)
      .map((r) => structuredClone(r));
  }
}
