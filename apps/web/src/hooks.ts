import { type Period } from "@receipt-box/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useApi } from "./api";
import type { ReceiptFieldsFragment, ReceiptInput } from "./gql/graphql";
import { DeleteReceiptMutation, InboxQuery, ReceiptQuery, ReceiptsQuery, SaveReceiptMutation, SummaryQuery } from "./operations";

const BUSY = new Set(["UPLOADING", "PROCESSING"]);
const busy = (rows: Array<Pick<ReceiptFieldsFragment, "status">> | undefined) => !!rows?.some((r) => BUSY.has(r.status));

// Query keys: one place, so mutations invalidate exactly what they change.
export const keys = {
  inbox: ["inbox"] as const,
  receipts: (p: Pick<Period, "from" | "to">) => ["receipts", p.from, p.to] as const,
  summary: (p: Pick<Period, "from" | "to">) => ["summary", p.from, p.to] as const,
  receipt: (id: string) => ["receipt", id] as const,
};

/** Receipts not yet reviewed. Polls every 2 s only while one is still uploading or being read. */
export function useInbox() {
  const api = useApi();
  return useQuery({
    queryKey: keys.inbox,
    queryFn: async () => (await api.gql(InboxQuery)).inbox as ReceiptFieldsFragment[],
    refetchInterval: (q) => (busy(q.state.data) ? 2000 : false),
  });
}

export function useReceipts(period: Pick<Period, "from" | "to">) {
  const api = useApi();
  return useQuery({
    queryKey: keys.receipts(period),
    queryFn: async () => (await api.gql(ReceiptsQuery, period)).receipts as ReceiptFieldsFragment[],
  });
}

export function useSummary(period: Pick<Period, "from" | "to">) {
  const api = useApi();
  return useQuery({ queryKey: keys.summary(period), queryFn: async () => (await api.gql(SummaryQuery, period)).summary });
}

export function useReceipt(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: keys.receipt(id),
    queryFn: async () => ((await api.gql(ReceiptQuery, { id })).receipt as ReceiptFieldsFragment | null) ?? null,
    refetchInterval: (q) => (q.state.data && BUSY.has(q.state.data.status) ? 2000 : false),
  });
}

export function useSaveReceipt(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReceiptInput) => (await api.gql(SaveReceiptMutation, { id, input })).saveReceipt as ReceiptFieldsFragment,
    onSuccess: (saved) => {
      qc.setQueryData(keys.receipt(id), saved);
      void qc.invalidateQueries({ queryKey: keys.inbox });
      void qc.invalidateQueries({ queryKey: ["receipts"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
}

export function useDeleteReceipt() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.gql(DeleteReceiptMutation, { id })).deleteReceipt,
    onSuccess: () => qc.invalidateQueries(),
  });
}

export type UploadItem = { key: string; name: string; progress: number; error?: string; done?: boolean };

/** Upload several files one after another, tracking progress for each. */
export function useUploads() {
  const api = useApi();
  const qc = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const patch = (key: string, p: Partial<UploadItem>) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...p } : i)));

  async function upload(files: File[]) {
    const queued = files.map((f) => ({ key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`, name: f.name, progress: 0 }));
    setItems((all) => [...queued, ...all.filter((i) => !i.done)]);
    for (const [n, file] of files.entries()) {
      const key = queued[n]!.key;
      try {
        const { upload: form } = await api.startUpload(file);
        await qc.invalidateQueries({ queryKey: keys.inbox }); // shows the "uploading" row straight away
        await api.sendToStorage(form, file, (progress) => patch(key, { progress }));
        patch(key, { progress: 1, done: true });
        await qc.invalidateQueries({ queryKey: keys.inbox });
      } catch (err) {
        patch(key, { error: (err as Error).message });
      }
    }
  }

  return { items, upload, clear: () => setItems((all) => all.filter((i) => !i.done)) };
}
