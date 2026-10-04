import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Logger } from "@aws-lambda-powertools/logger";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { LocalBlobStore } from "../src/blob/local";
import type { Extraction, Extractor } from "../src/domain";
import { processUpload, READ_FAILED } from "../src/process";
import { MemoryRepo } from "../src/repo/memory";

const log = new Logger({ logLevel: "SILENT" });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

class FakeExtractor implements Extractor {
  readonly engine = "fake";
  calls = 0;
  constructor(private readonly behaviour: () => Extraction) {}
  async extract() {
    this.calls++;
    return this.behaviour();
  }
}

const READ: Extraction = {
  engine: "fake",
  ms: 5,
  vendor: { value: "Placemakers", confidence: 0.9 },
  date: { value: "2026-09-15", confidence: 0.9 },
  total: { value: "115.00", confidence: 0.92 },
  gst: { value: "15.00", confidence: 0.95 },
};

function setup(extractor: Extractor = new FakeExtractor(() => READ)) {
  const repo = new MemoryRepo();
  const blobs = new LocalBlobStore(mkdtempSync(join(tmpdir(), "rb-")), "");
  const app = createApp({ repo, blobs, log, authMode: "dev" });
  const as = (user: string) => ({ "content-type": "application/json", "x-dev-user": user });

  const gql = async (query: string, variables: object = {}, user = "alice") => {
    const res = await app.request("/graphql", { method: "POST", headers: as(user), body: JSON.stringify({ query, variables }) });
    return (await res.json()) as { data?: Record<string, any>; errors?: Array<{ message: string; extensions?: any }> };
  };

  /** What the browser does: ask for an upload, post the file to "S3", then S3's event runs the processor. */
  const upload = async (user = "alice") => {
    const res = await app.request("/api/uploads", {
      method: "POST",
      headers: as(user),
      body: JSON.stringify({ fileName: "receipt.png", contentType: "image/png", size: PNG.byteLength }),
    });
    expect(res.status).toBe(201);
    const { receiptId, upload } = (await res.json()) as { receiptId: string; upload: { fields: Record<string, string> } };
    expect(await blobs.accept(upload.fields.key!, "image/png", PNG)).toBeNull();
    return { receiptId, key: upload.fields.key! };
  };

  return { repo, blobs, app, gql, upload, as, deps: { repo, blobs, extractor, log } };
}

const SAVE = `mutation($id: ID!, $input: ReceiptInput!) { saveReceipt(id: $id, input: $input) { id status vendor totalCents } }`;
const input = { vendor: "Placemakers", date: "2026-09-15", totalCents: 11500, gstCents: 1500, category: "TOOLS" };

describe("the receipt journey", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it("upload -> read -> review -> totals -> CSV", async () => {
    const { receiptId, key } = await t.upload();
    expect((await t.gql(`{ inbox { id status } }`)).data!.inbox).toEqual([{ id: receiptId, status: "UPLOADING" }]);

    expect(await processUpload(t.deps, key)).toBe("processed");
    const inbox = (await t.gql(`{ inbox { status vendor date totalCents gstCents imageUrl extraction { engine total { value confidence } } } }`)).data!.inbox;
    expect(inbox[0]).toMatchObject({ status: "NEEDS_REVIEW", vendor: "Placemakers", totalCents: 11500, gstCents: 1500, extraction: { engine: "fake" } });
    expect(inbox[0].imageUrl).toContain("/local-blob/");

    const saved = await t.gql(SAVE, { id: receiptId, input });
    expect(saved.data!.saveReceipt).toMatchObject({ status: "REVIEWED", totalCents: 11500 });
    expect((await t.gql(`{ inbox { id } }`)).data!.inbox).toEqual([]);

    const period = { from: "2026-09-01", to: "2026-09-30" };
    const summary = (await t.gql(`query($from: String!, $to: String!) { summary(from: $from, to: $to) { count totalCents gstCents byCategory { category totalCents } } }`, period))
      .data!.summary;
    expect(summary).toEqual({ count: 1, totalCents: 11500, gstCents: 1500, byCategory: [{ category: "TOOLS", totalCents: 11500 }] });

    const csv = await t.app.request(`/api/export.csv?from=${period.from}&to=${period.to}`, { headers: t.as("alice") });
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain(`2026-09-15,Placemakers,Tools and equipment,115.00,15.00,100.00,,${receiptId}`);
  });

  it("returns field-level errors the form can show", async () => {
    const { receiptId, key } = await t.upload();
    await processUpload(t.deps, key);
    const res = await t.gql(SAVE, { id: receiptId, input: { ...input, gstCents: 9000 } });
    expect(res.errors![0]!.extensions).toMatchObject({ code: "BAD_USER_INPUT", fields: { gstCents: expect.stringContaining("3/23") } });
  });

  it("keeps each user's receipts private", async () => {
    const { receiptId, key } = await t.upload("alice");
    await processUpload(t.deps, key);
    expect((await t.gql(`query($id: ID!) { receipt(id: $id) { id } }`, { id: receiptId }, "mallory")).data!.receipt).toBeNull();
    expect((await t.gql(`{ inbox { id } }`, {}, "mallory")).data!.inbox).toEqual([]);
    expect((await t.gql(`mutation($id: ID!) { deleteReceipt(id: $id) }`, { id: receiptId }, "mallory")).data!.deleteReceipt).toBe(false);
    expect((await t.gql(SAVE, { id: receiptId, input }, "mallory")).errors![0]!.extensions.code).toBe("NOT_FOUND");
  });

  it("deletes the image with the receipt", async () => {
    const { receiptId, key } = await t.upload();
    expect((await t.gql(`mutation($id: ID!) { deleteReceipt(id: $id) }`, { id: receiptId })).data!.deleteReceipt).toBe(true);
    await expect(t.blobs.get(key)).rejects.toThrow();
  });

  it("rejects bad uploads before they reach S3", async () => {
    const bad = await t.app.request("/api/uploads", {
      method: "POST",
      headers: t.as("alice"),
      body: JSON.stringify({ fileName: "x.pdf", contentType: "application/pdf", size: 10 }),
    });
    expect(bad.status).toBe(400);
    // The storage policy also holds: wrong type or a file nobody asked to upload is refused.
    const { key } = await t.upload();
    expect(await t.blobs.accept(key, "image/png", PNG)).toMatch(/No valid upload policy/);
  });
});

describe("processing", () => {
  it("is idempotent: a duplicate S3 event is skipped", async () => {
    const extractor = new FakeExtractor(() => READ);
    const t = setup(extractor);
    const { key } = await t.upload();
    expect(await processUpload(t.deps, key)).toBe("processed");
    expect(await processUpload(t.deps, key)).toBe("skipped");
    expect(extractor.calls).toBe(1);
  });

  it("marks unreadable receipts FAILED so the person can type them in", async () => {
    const t = setup(
      new FakeExtractor(() => {
        throw Object.assign(new Error("bad image"), { name: "UnsupportedDocumentException" });
      }),
    );
    const { receiptId, key } = await t.upload();
    expect(await processUpload(t.deps, key)).toBe("failed");
    expect((await t.repo.get("alice", receiptId))?.error).toBe(READ_FAILED);
    expect((await t.gql(SAVE, { id: receiptId, input })).data!.saveReceipt.status).toBe("REVIEWED");
  });

  it("checks the bytes really are an image before any OCR runs", async () => {
    const extractor = new FakeExtractor(() => READ);
    const t = setup(extractor);
    const res = await t.app.request("/api/uploads", {
      method: "POST",
      headers: t.as("alice"),
      body: JSON.stringify({ fileName: "renamed.png", contentType: "image/png", size: 18 }),
    });
    const { receiptId, upload } = (await res.json()) as { receiptId: string; upload: { fields: Record<string, string> } };
    await t.blobs.accept(upload.fields.key!, "image/png", new TextEncoder().encode("<script>x</script>"));
    expect(await processUpload(t.deps, upload.fields.key!)).toBe("failed");
    expect(extractor.calls).toBe(0);
    expect((await t.repo.get("alice", receiptId))?.status).toBe("FAILED");
  });

  it("re-throws throttling so Lambda retries (and the DLQ catches what still fails)", async () => {
    const t = setup(
      new FakeExtractor(() => {
        throw Object.assign(new Error("slow down"), { name: "ThrottlingException" });
      }),
    );
    const { receiptId, key } = await t.upload();
    await expect(processUpload(t.deps, key)).rejects.toThrow("slow down");
    expect((await t.repo.get("alice", receiptId))?.status).toBe("PROCESSING");
  });
});

describe("auth on AWS", () => {
  it("takes the user from the verified JWT claims and refuses requests without them", async () => {
    const repo = new MemoryRepo();
    const app = createApp({ repo, blobs: new LocalBlobStore(mkdtempSync(join(tmpdir(), "rb-")), ""), log, authMode: "jwt" });
    const body = JSON.stringify({ query: "{ inbox { id } }" });
    const headers = { "content-type": "application/json", "x-dev-user": "alice" }; // ignored in jwt mode
    expect((await app.request("/graphql", { method: "POST", headers, body })).status).toBe(401);
    const event = { requestContext: { requestId: "req-1", authorizer: { jwt: { claims: { sub: "cognito-sub-1" } } } } };
    const ok = await app.request("/graphql", { method: "POST", headers, body }, { event });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-request-id")).toBe("req-1");
  });
});
