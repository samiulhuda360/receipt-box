import { z } from "zod";

import { gstFromInclusive } from "./money";
import { isValidIsoDate } from "./periods";

export const CATEGORIES = [
  { id: "VEHICLE", label: "Vehicle and fuel" },
  { id: "OFFICE", label: "Office and supplies" },
  { id: "SOFTWARE", label: "Software and subscriptions" },
  { id: "PHONE_INTERNET", label: "Phone and internet" },
  { id: "TRAVEL", label: "Travel" },
  { id: "MEALS", label: "Meals and entertainment" },
  { id: "TOOLS", label: "Tools and equipment" },
  { id: "PROFESSIONAL", label: "Professional services" },
  { id: "OTHER", label: "Other" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

export const RECEIPT_STATUSES = ["UPLOADING", "PROCESSING", "NEEDS_REVIEW", "REVIEWED", "FAILED"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

/** Textract's synchronous AnalyzeExpense takes JPEG and PNG up to 10 MB; the local OCR reads the same. */
export const UPLOAD_TYPES = ["image/jpeg", "image/png"] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(UPLOAD_TYPES),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, "Receipts must be 10 MB or smaller"),
});
export type UploadRequest = z.infer<typeof uploadRequestSchema>;

/** One schema for the review form and the API, so both reject the same things with the same words. */
export const receiptInputSchema = z
  .object({
    vendor: z.string().trim().min(1, "Who did you pay?").max(120),
    date: z
      .string()
      .refine(isValidIsoDate, "Use a real date")
      .refine((d) => d <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), "The date is in the future"),
    totalCents: z.number().int("Whole cents only").positive("The total must be more than $0").max(10_000_000, "That total looks too big"),
    gstCents: z.number().int("Whole cents only").min(0, "GST can't be negative"),
    category: z.enum(CATEGORY_IDS),
    notes: z.string().max(500).default(""),
  })
  .refine((r) => r.gstCents <= gstFromInclusive(r.totalCents) + 1, {
    path: ["gstCents"],
    message: "GST can't be more than 3/23 of the total (15% GST)",
  });
export type ReceiptInput = z.infer<typeof receiptInputSchema>;
