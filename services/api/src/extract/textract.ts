import { AnalyzeExpenseCommand, type ExpenseField, type TextractClient } from "@aws-sdk/client-textract";
import { centsToDecimal } from "@receipt-box/shared";

import type { ExtractedField, Extractor } from "../domain";
import { amounts, dateFrom } from "./parse";

/**
 * Amazon Textract AnalyzeExpense: a managed model trained on receipts and invoices. It returns
 * typed summary fields (VENDOR_NAME, INVOICE_RECEIPT_DATE, TOTAL, TAX...) with confidences.
 * We keep the best-scoring field of each type and normalise the printed values.
 */
export class TextractExtractor implements Extractor {
  readonly engine = "textract";

  constructor(private readonly client: TextractClient) {}

  async extract(image: Uint8Array) {
    const started = Date.now();
    const res = await this.client.send(new AnalyzeExpenseCommand({ Document: { Bytes: image } }));
    return { engine: this.engine, ms: Date.now() - started, ...mapExpenseFields(res.ExpenseDocuments?.[0]?.SummaryFields ?? []) };
  }
}

function confidence(f: ExpenseField): number {
  return Math.min(f.Type?.Confidence ?? 0, f.ValueDetection?.Confidence ?? 0) / 100;
}

function best(fields: ExpenseField[], ...types: string[]): ExpenseField | undefined {
  return fields
    .filter((f) => types.includes(f.Type?.Text ?? "") && f.ValueDetection?.Text?.trim())
    .sort((a, b) => confidence(b) - confidence(a))[0];
}

function money(f: ExpenseField | undefined): ExtractedField | undefined {
  const cents = f ? amounts(f.ValueDetection!.Text!).at(-1) : undefined;
  return f && cents !== undefined ? { value: centsToDecimal(cents), confidence: confidence(f) } : undefined;
}

export function mapExpenseFields(fields: ExpenseField[]) {
  const vendor = best(fields, "VENDOR_NAME", "NAME");
  const date = best(fields, "INVOICE_RECEIPT_DATE");
  const parsedDate = date ? dateFrom(date.ValueDetection!.Text!) : null;
  const out = {
    vendor: vendor ? { value: vendor.ValueDetection!.Text!.split("\n")[0]!.trim(), confidence: confidence(vendor) } : undefined,
    date: date && parsedDate ? { value: parsedDate.iso, confidence: confidence(date) - (parsedDate.ambiguous ? 0.1 : 0) } : undefined,
    total: money(best(fields, "TOTAL")) ?? money(best(fields, "AMOUNT_PAID")),
    gst: money(best(fields, "TAX")),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as Omit<typeof out, never>;
}
