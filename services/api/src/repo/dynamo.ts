import { ConditionalCheckFailedException, type DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, type QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import type { ReceiptStatus } from "@receipt-box/shared";

import type { ReceiptPatch, ReceiptRecord, ReceiptRepo } from "../domain";

/**
 * Single-table design (one DynamoDB table, keys chosen for the app's three read patterns):
 *
 *   item        PK = USER#<user>   SK = RECEIPT#<id>                 get / update / delete one receipt
 *   GSI1 ledger GSI1PK = USER#<user>  GSI1SK = DATE#<date>#<id>     reviewed receipts in a date range
 *   GSI2 inbox  GSI2PK = INBOX#<user> GSI2SK = <createdAt>           receipts still to review
 *
 * Both indexes are sparse: an item only carries GSI1 keys once it is REVIEWED and dated, and only
 * GSI2 keys until then. So each query reads exactly the rows it returns, never filters them out.
 * Uploads that never finish expire through the table's TTL (`expiresAt`).
 */
type Item = ReceiptRecord & {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
  expiresAt?: number;
  version: number;
};

const UPLOAD_TTL_SECONDS = 24 * 3600;

export function toItem(r: ReceiptRecord, version: number): Item {
  const item: Item = { ...r, PK: `USER#${r.userId}`, SK: `RECEIPT#${r.id}`, version };
  if (r.status === "REVIEWED" && r.date) {
    item.GSI1PK = `USER#${r.userId}`;
    item.GSI1SK = `DATE#${r.date}#${r.id}`;
  } else if (r.status !== "REVIEWED") {
    item.GSI2PK = `INBOX#${r.userId}`;
    item.GSI2SK = r.createdAt;
  }
  if (r.status === "UPLOADING") item.expiresAt = Math.floor(Date.parse(r.createdAt) / 1000) + UPLOAD_TTL_SECONDS;
  return item;
}

function toRecord(item: Record<string, unknown>): ReceiptRecord {
  const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, expiresAt, version, ...record } = item as Item;
  void [PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, expiresAt, version];
  return record;
}

export class DynamoRepo implements ReceiptRepo {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    client: DynamoDBClient,
    private readonly table: string,
  ) {
    this.doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  }

  private key(userId: string, id: string) {
    return { PK: `USER#${userId}`, SK: `RECEIPT#${id}` };
  }

  async create(record: ReceiptRecord) {
    await this.doc.send(
      new PutCommand({ TableName: this.table, Item: toItem(record, 1), ConditionExpression: "attribute_not_exists(PK)" }),
    );
  }

  private async getItem(userId: string, id: string) {
    const res = await this.doc.send(new GetCommand({ TableName: this.table, Key: this.key(userId, id), ConsistentRead: true }));
    return res.Item as Item | undefined;
  }

  async get(userId: string, id: string) {
    const item = await this.getItem(userId, id);
    return item ? toRecord(item) : null;
  }

  /**
   * Read, merge, write back with optimistic locking: the write only lands if nobody changed the item
   * since we read it (version check) and, with `onlyIf`, if it is still in an expected status.
   * Writing the whole item keeps the sparse index keys consistent with the new status.
   */
  async update(userId: string, id: string, patch: ReceiptPatch, onlyIf?: ReceiptStatus[]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await this.getItem(userId, id);
      if (!current || (onlyIf && !onlyIf.includes(current.status))) return null;
      const next = { ...toRecord(current), ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() };
      try {
        await this.doc.send(
          new PutCommand({
            TableName: this.table,
            Item: toItem(next, current.version + 1),
            ConditionExpression: "#v = :v",
            ExpressionAttributeNames: { "#v": "version" },
            ExpressionAttributeValues: { ":v": current.version },
          }),
        );
        return next;
      } catch (err) {
        if (!(err instanceof ConditionalCheckFailedException)) throw err;
        // Someone else wrote first: re-read and try again.
      }
    }
    throw new Error(`receipt ${id} kept changing while being updated`);
  }

  async delete(userId: string, id: string) {
    const res = await this.doc.send(new DeleteCommand({ TableName: this.table, Key: this.key(userId, id), ReturnValues: "ALL_OLD" }));
    return !!res.Attributes;
  }

  private async queryAll(input: QueryCommandInput) {
    const out: ReceiptRecord[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(new QueryCommand({ ...input, ExclusiveStartKey: start }));
      out.push(...(res.Items ?? []).map(toRecord));
      start = res.LastEvaluatedKey;
    } while (start);
    return out;
  }

  listReviewed(userId: string, from: string, to: string) {
    return this.queryAll({
      TableName: this.table,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND GSI1SK BETWEEN :from AND :to",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":from": `DATE#${from}`, ":to": `DATE#${to}#~` },
      ScanIndexForward: false,
    });
  }

  listInbox(userId: string) {
    return this.queryAll({
      TableName: this.table,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: { ":pk": `INBOX#${userId}` },
      ScanIndexForward: false,
    });
  }
}
