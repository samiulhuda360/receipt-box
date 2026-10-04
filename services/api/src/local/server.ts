import { rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { serve } from "@hono/node-server";

import { createApp } from "../app";
import { LocalBlobStore } from "../blob/local";
import type { Extractor } from "../domain";
import { parseReceiptText } from "../extract/parse";
import { TesseractExtractor } from "../extract/tesseract";
import { logger } from "../observability";
import { processUpload } from "../process";
import { MemoryRepo } from "../repo/memory";

/**
 * Local mode: the same app as the Lambda, with a folder instead of S3, a JSON file instead of
 * DynamoDB, Tesseract instead of Textract, and a fixed demo user instead of Cognito.
 *   PORT (8787), DATA_DIR (.data), RESET_DATA=1 to start empty, EXTRACTOR=tesseract|text
 */
const port = Number(process.env.PORT ?? 8787);
const dataDir = resolve(process.env.DATA_DIR ?? ".data");
if (process.env.RESET_DATA === "1") {
  rmSync(join(dataDir, "db.json"), { force: true });
  rmSync(join(dataDir, "blobs"), { recursive: true, force: true });
}

// "text" reads a .txt sidecar instead of running OCR: fast and deterministic for UI tests.
class SidecarTextExtractor implements Extractor {
  readonly engine = "text";
  async extract(image: Uint8Array) {
    return { engine: this.engine, ms: 1, ...parseReceiptText(new TextDecoder().decode(image).split("\n---text---\n")[1] ?? "") };
  }
}

const repo = new MemoryRepo(join(dataDir, "db.json"));
const blobs = new LocalBlobStore(join(dataDir, "blobs"), ""); // relative URLs, served through the web dev server's proxy
const extractor: Extractor = process.env.EXTRACTOR === "text" ? new SidecarTextExtractor() : new TesseractExtractor(join(dataDir, "tesseract"));
const app = createApp({ repo, blobs, log: logger, authMode: "dev" });

// Stand-in for the S3 form upload endpoint.
app.post("/local-blob", async (c) => {
  const form = await c.req.parseBody();
  const key = String(form.key ?? "");
  const file = form.file;
  if (!(file instanceof File)) return c.text("No file in the form", 400);
  const error = await blobs.accept(key, String(form["Content-Type"] ?? ""), new Uint8Array(await file.arrayBuffer()));
  if (error) return c.text(error, 403);
  // S3 would now send an ObjectCreated event to the processor Lambda; do the same in-process.
  setImmediate(() => void processUpload({ repo, blobs, extractor, log: logger }, key).catch((err) => logger.error("processing crashed", { err })));
  return c.body(null, 204);
});

app.get("/local-blob/:key", async (c) => {
  const key = decodeURIComponent(c.req.param("key"));
  const type = key.endsWith(".png") ? "image/png" : "image/jpeg";
  try {
    return c.body(await readFile(blobs.file(key)), 200, { "content-type": type });
  } catch {
    return c.text("Not found", 404);
  }
});

serve({ fetch: app.fetch, port }, () => {
  logger.info(`Receipt Box API (local mode) on http://localhost:${port}`, { dataDir, extractor: extractor.engine });
});
