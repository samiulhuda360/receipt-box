import type { CategoryId, ReceiptStatus } from "@receipt-box/shared";

export type ExtractedField = { value: string; confidence: number };

/** What the reader (Textract on AWS, Tesseract locally) found on the receipt, before a person checks it. */
export type Extraction = {
  engine: string;
  ms: number;
  vendor?: ExtractedField;
  date?: ExtractedField;
  total?: ExtractedField;
  gst?: ExtractedField;
};

export type ReceiptRecord = {
  userId: string;
  id: string;
  status: ReceiptStatus;
  fileName: string;
  contentType: string;
  objectKey: string;
  vendor: string | null;
  date: string | null;
  totalCents: number | null;
  gstCents: number | null;
  category: CategoryId;
  notes: string;
  extraction: Extraction | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReceiptPatch = Partial<Omit<ReceiptRecord, "userId" | "id" | "createdAt">>;

/**
 * Storage for receipt records. Every call is scoped to one user: there is no way to read
 * another user's receipt through this interface, which is the main access-control guarantee.
 */
export interface ReceiptRepo {
  create(record: ReceiptRecord): Promise<void>;
  get(userId: string, id: string): Promise<ReceiptRecord | null>;
  /** Apply a patch; with `onlyIf`, only when the current status is one of those (else returns null). */
  update(userId: string, id: string, patch: ReceiptPatch, onlyIf?: ReceiptStatus[]): Promise<ReceiptRecord | null>;
  delete(userId: string, id: string): Promise<boolean>;
  /** Reviewed receipts dated from..to inclusive, newest first. */
  listReviewed(userId: string, from: string, to: string): Promise<ReceiptRecord[]>;
  /** Receipts that are not reviewed yet, newest first. */
  listInbox(userId: string): Promise<ReceiptRecord[]>;
}

/** Where the images live: S3 on AWS, a folder locally. */
export interface BlobStore {
  /** A browser-ready form upload (S3 presigned POST): the size and type limits are enforced by the store. */
  createUpload(key: string, contentType: string, maxBytes: number): Promise<{ url: string; fields: Record<string, string> }>;
  signedGetUrl(key: string): Promise<string>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export interface Extractor {
  readonly engine: string;
  extract(image: Uint8Array, contentType: string): Promise<Extraction>;
}

/** Object keys carry the owner and the receipt id, so the processor needs nothing else from the event. */
export function objectKey(userId: string, id: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.-]+/g, "_").slice(-80) || "receipt";
  return `uploads/${encodeURIComponent(userId)}/${id}/${safe}`;
}

export function parseObjectKey(key: string): { userId: string; id: string } | null {
  const m = /^uploads\/([^/]+)\/([0-9a-f-]{36})\/[^/]+$/.exec(key);
  return m ? { userId: decodeURIComponent(m[1]!), id: m[2]! } : null;
}
