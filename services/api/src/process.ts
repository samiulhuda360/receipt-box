import type { Logger } from "@aws-lambda-powertools/logger";
import { parseMoney } from "@receipt-box/shared";

import { type BlobStore, type Extractor, parseObjectKey, type ReceiptRepo } from "./domain";

type Log = Pick<Logger, "info" | "warn" | "error">;

export type ProcessDeps = { repo: ReceiptRepo; blobs: BlobStore; extractor: Extractor; log: Log };

export const READ_FAILED = "We couldn't read this receipt. Enter the details by hand.";

/**
 * What the bytes really are, from their first bytes ("magic numbers"). The upload policy pins the
 * declared Content-Type, not the content, so a renamed file is caught here before any OCR runs.
 */
export function sniffImage(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

class UnsupportedImage extends Error {
  override name = "UnsupportedDocumentException";
}

/** Errors worth retrying: throttling, timeouts, 5xx. Anything else (a bad image) will fail the same way again. */
export function isTransient(err: unknown): boolean {
  const e = err as { name?: string; $retryable?: unknown; $metadata?: { httpStatusCode?: number } };
  return (
    !!e?.$retryable ||
    (e?.$metadata?.httpStatusCode ?? 0) >= 500 ||
    ["ThrottlingException", "ProvisionedThroughputExceededException", "InternalServerError", "ServiceUnavailable", "TimeoutError", "RequestTimeout"].includes(
      e?.name ?? "",
    )
  );
}

/**
 * Called for every object S3 reports as created (and by the local server after an upload).
 * - Idempotent: S3 can deliver an event twice; a receipt that is already read is skipped.
 * - Transient errors are re-thrown so Lambda retries; after its retries the event lands in the
 *   dead-letter queue (alarmed) and the receipt shows as "taking longer than expected".
 * - A receipt that can't be read becomes FAILED with a friendly message; the person types it in.
 */
export async function processUpload(deps: ProcessDeps, key: string): Promise<"processed" | "failed" | "skipped"> {
  const { repo, blobs, extractor, log } = deps;
  const ref = parseObjectKey(key);
  if (!ref) {
    log.warn("ignoring an object outside the uploads/ layout", { key });
    return "skipped";
  }
  const ctx = { receiptId: ref.id, key };
  const receipt = await repo.update(ref.userId, ref.id, { status: "PROCESSING", error: null }, ["UPLOADING", "PROCESSING"]);
  if (!receipt) {
    log.info("receipt already processed or deleted; skipping", ctx);
    return "skipped";
  }
  try {
    const image = await blobs.get(key);
    if (sniffImage(image) !== receipt.contentType) throw new UnsupportedImage(`not a ${receipt.contentType} file`);
    const ex = await extractor.extract(image, receipt.contentType);
    await repo.update(
      ref.userId,
      ref.id,
      {
        status: "NEEDS_REVIEW",
        extraction: ex,
        vendor: ex.vendor?.value ?? null,
        date: ex.date?.value ?? null,
        totalCents: ex.total ? parseMoney(ex.total.value) : null,
        gstCents: ex.gst ? parseMoney(ex.gst.value) : null,
      },
      ["PROCESSING"],
    );
    log.info("receipt read", { ...ctx, engine: ex.engine, ms: ex.ms, found: Object.keys(ex).filter((k) => !["engine", "ms"].includes(k)) });
    return "processed";
  } catch (err) {
    if (isTransient(err)) {
      log.warn("transient error reading receipt; letting Lambda retry", { ...ctx, error: String(err) });
      throw err;
    }
    log.error("could not read receipt", { ...ctx, error: String(err) });
    await repo.update(ref.userId, ref.id, { status: "FAILED", error: READ_FAILED }, ["PROCESSING"]);
    return "failed";
  }
}
