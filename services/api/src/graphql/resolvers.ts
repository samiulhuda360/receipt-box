import { CATEGORY_IDS, isValidIsoDate, receiptInputSchema } from "@receipt-box/shared";
import { GraphQLError } from "graphql";

import type { ReceiptRecord } from "../domain";
import type { Resolvers } from "../generated/graphql";

/** After this long in PROCESSING a receipt is treated as stuck, and the person may enter it by hand. */
export const STUCK_AFTER_MS = 5 * 60_000;

function badInput(message: string, fields: Record<string, string> = {}): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT", fields } });
}

function checkRange(from: string, to: string) {
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) throw badInput("Dates must be yyyy-mm-dd");
  if (from > to) throw badInput("The start date is after the end date");
}

function editable(r: ReceiptRecord, now = Date.now()): boolean {
  return ["NEEDS_REVIEW", "REVIEWED", "FAILED"].includes(r.status) || (r.status === "PROCESSING" && now - Date.parse(r.updatedAt) > STUCK_AFTER_MS);
}

export const resolvers: Resolvers = {
  Query: {
    receipts: (_, { from, to }, { repo, userId }) => {
      checkRange(from, to);
      return repo.listReviewed(userId, from, to);
    },
    inbox: (_, __, { repo, userId }) => repo.listInbox(userId),
    receipt: (_, { id }, { repo, userId }) => repo.get(userId, id),
    summary: async (_, { from, to }, { repo, userId }) => {
      checkRange(from, to);
      const rows = await repo.listReviewed(userId, from, to);
      const byCategory = CATEGORY_IDS.map((category) => {
        const mine = rows.filter((r) => r.category === category);
        return {
          category,
          count: mine.length,
          totalCents: mine.reduce((s, r) => s + (r.totalCents ?? 0), 0),
          gstCents: mine.reduce((s, r) => s + (r.gstCents ?? 0), 0),
        };
      }).filter((c) => c.count > 0);
      return {
        from,
        to,
        count: rows.length,
        totalCents: byCategory.reduce((s, c) => s + c.totalCents, 0),
        gstCents: byCategory.reduce((s, c) => s + c.gstCents, 0),
        byCategory: byCategory.sort((a, b) => b.totalCents - a.totalCents),
      };
    },
  },

  Mutation: {
    saveReceipt: async (_, { id, input }, { repo, userId, log }) => {
      const parsed = receiptInputSchema.safeParse({ ...input, notes: input.notes ?? "" });
      if (!parsed.success) {
        const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message]));
        throw badInput("Check the highlighted fields", fields);
      }
      const current = await repo.get(userId, id);
      if (!current) throw new GraphQLError("Receipt not found", { extensions: { code: "NOT_FOUND" } });
      if (!editable(current)) throw badInput("This receipt is still being read. Try again in a moment.");
      const saved = await repo.update(userId, id, { ...parsed.data, status: "REVIEWED", error: null });
      if (!saved) throw new GraphQLError("Receipt not found", { extensions: { code: "NOT_FOUND" } });
      log.info("receipt reviewed", { receiptId: id, category: saved.category });
      return saved;
    },

    deleteReceipt: async (_, { id }, { repo, blobs, userId, log }) => {
      const current = await repo.get(userId, id);
      if (!current) return false;
      await blobs.delete(current.objectKey);
      await repo.delete(userId, id);
      log.info("receipt deleted", { receiptId: id });
      return true;
    },
  },

  Receipt: {
    // A fresh signed link on every read: the bucket stays private and links expire after 5 minutes.
    imageUrl: (r, _, { blobs }) => (r.status === "UPLOADING" ? null : blobs.signedGetUrl(r.objectKey)),
  },
};
