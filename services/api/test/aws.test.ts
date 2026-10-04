import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { AnalyzeExpenseCommand, TextractClient } from "@aws-sdk/client-textract";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";

import type { ReceiptRecord } from "../src/domain";
import { mapExpenseFields, TextractExtractor } from "../src/extract/textract";
import { DynamoRepo, toItem } from "../src/repo/dynamo";

const record = (over: Partial<ReceiptRecord> = {}): ReceiptRecord => ({
  userId: "u1",
  id: "11111111-1111-1111-1111-111111111111",
  status: "NEEDS_REVIEW",
  fileName: "r.jpg",
  contentType: "image/jpeg",
  objectKey: "uploads/u1/11111111-1111-1111-1111-111111111111/r.jpg",
  vendor: "Z Energy",
  date: "2026-09-10",
  totalCents: 8050,
  gstCents: 1050,
  category: "VEHICLE",
  notes: "",
  extraction: null,
  error: null,
  createdAt: "2026-09-10T01:00:00.000Z",
  updatedAt: "2026-09-10T01:00:00.000Z",
  ...over,
});

describe("DynamoDB single-table keys", () => {
  it("puts reviewed, dated receipts in the ledger index only", () => {
    const item = toItem(record({ status: "REVIEWED" }), 1);
    expect(item).toMatchObject({ PK: "USER#u1", SK: `RECEIPT#${record().id}`, GSI1PK: "USER#u1", GSI1SK: `DATE#2026-09-10#${record().id}` });
    expect(item.GSI2PK).toBeUndefined();
  });

  it("puts unreviewed receipts in the inbox index only, and lets abandoned uploads expire", () => {
    const item = toItem(record({ status: "UPLOADING", date: null }), 1);
    expect(item).toMatchObject({ GSI2PK: "INBOX#u1", GSI2SK: "2026-09-10T01:00:00.000Z" });
    expect(item.GSI1PK).toBeUndefined();
    expect(item.expiresAt).toBe(Date.parse("2026-09-10T01:00:00.000Z") / 1000 + 86_400);
  });
});

describe("DynamoRepo.update", () => {
  const ddb = mockClient(DynamoDBDocumentClient);
  beforeEach(() => ddb.reset());

  it("retries when another writer got in first (optimistic locking)", async () => {
    ddb.on(GetCommand).resolvesOnce({ Item: toItem(record(), 1) }).resolves({ Item: toItem(record(), 2) });
    ddb
      .on(PutCommand)
      .rejectsOnce(new ConditionalCheckFailedException({ message: "changed", $metadata: {} }))
      .resolves({});
    const repo = new DynamoRepo(new DynamoDBClient({}), "table");
    const saved = await repo.update("u1", record().id, { status: "REVIEWED" });
    expect(saved?.status).toBe("REVIEWED");
    const puts = ddb.commandCalls(PutCommand);
    expect(puts).toHaveLength(2);
    expect(puts[1]!.args[0].input.ExpressionAttributeValues).toEqual({ ":v": 2 });
    expect(puts[1]!.args[0].input.Item).toMatchObject({ version: 3, GSI1SK: `DATE#2026-09-10#${record().id}` });
  });

  it("does nothing when the status is not one we expect", async () => {
    ddb.on(GetCommand).resolves({ Item: toItem(record({ status: "REVIEWED" }), 4) });
    const repo = new DynamoRepo(new DynamoDBClient({}), "table");
    expect(await repo.update("u1", record().id, { status: "PROCESSING" }, ["UPLOADING"])).toBeNull();
    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
  });
});

describe("Textract AnalyzeExpense", () => {
  const field = (type: string, text: string, conf = 98) => ({ Type: { Text: type, Confidence: conf }, ValueDetection: { Text: text, Confidence: conf } });

  it("keeps the most confident field of each type and normalises values", () => {
    const out = mapExpenseFields([
      field("VENDOR_NAME", "BUNNINGS WAREHOUSE\nMt Wellington", 91),
      field("NAME", "Bunnings", 60),
      field("INVOICE_RECEIPT_DATE", "05/09/26", 95),
      field("TOTAL", "$1,150.00", 99),
      field("TAX", "GST $150.00", 97),
    ]);
    expect(out.vendor).toEqual({ value: "BUNNINGS WAREHOUSE", confidence: 0.91 });
    expect(out.date).toEqual({ value: "2026-09-05", confidence: 0.85 }); // 05/09 could be 9 May: flagged
    expect(out.total?.value).toBe("1150.00");
    expect(out.gst?.value).toBe("150.00");
  });

  it("calls AnalyzeExpense with the image bytes", async () => {
    const textract = mockClient(TextractClient);
    textract.on(AnalyzeExpenseCommand).resolves({ ExpenseDocuments: [{ SummaryFields: [field("TOTAL", "23.00")] }] });
    const out = await new TextractExtractor(new TextractClient({})).extract(new Uint8Array([1, 2, 3]));
    expect(out.engine).toBe("textract");
    expect(out.total?.value).toBe("23.00");
    expect(textract.commandCalls(AnalyzeExpenseCommand)[0]!.args[0].input.Document?.Bytes).toEqual(new Uint8Array([1, 2, 3]));
  });
});
