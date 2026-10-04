import type { UploadRequest } from "@receipt-box/shared";
import { useMemo } from "react";

import { useAppAuth } from "./auth";
import type { TypedDocumentString } from "./gql/graphql";

type GraphQLResponse<R> = { data?: R | null; errors?: Array<{ message: string; extensions?: { code?: string; fields?: Record<string, string> } }> };

export type Upload = { receiptId: string; upload: { url: string; fields: Record<string, string> } };

/** The last API request id we saw; sent with browser error reports so logs can be joined up. */
export let lastRequestId: string | undefined;

/** A GraphQL error that carries per-field messages from the server (extensions.fields). */
export class FieldErrors extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string>,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function createApi(headers: () => Record<string, string>) {
  /**
   * GraphQL over plain fetch: a POST with the query text and variables. Codegen emits each operation as a
   * typed string, so results and variables are type-checked without shipping a GraphQL client library.
   */
  async function gql<R, V>(document: TypedDocumentString<R, V>, ...[variables]: V extends Record<string, never> ? [] : [V]): Promise<R> {
    const res = await fetch("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers() },
      body: JSON.stringify({ query: document.toString(), variables }),
    });
    lastRequestId = res.headers.get("x-request-id") ?? lastRequestId;
    const body = (await res.json().catch(() => null)) as GraphQLResponse<R> | null;
    const first = body?.errors?.[0];
    if (first?.extensions?.fields) throw new FieldErrors(first.message, first.extensions.fields);
    if (first) throw new Error(first.message);
    if (!res.ok || !body?.data) throw new Error(res.status === 401 ? "Please sign in again." : "The server could not answer. Try again.");
    return body.data;
  }

  async function rest(path: string, init: RequestInit = {}) {
    const res = await fetch(path, { ...init, headers: { ...headers(), ...(init.headers as Record<string, string>) } });
    lastRequestId = res.headers.get("x-request-id") ?? lastRequestId;
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }
    return res;
  }

  return {
    gql,

    async startUpload(file: File): Promise<Upload> {
      const body: UploadRequest = { fileName: file.name, contentType: file.type as UploadRequest["contentType"], size: file.size };
      const res = await rest("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return (await res.json()) as Upload;
    },

    /**
     * Send the file straight to S3 with the presigned form fields. XMLHttpRequest rather than fetch:
     * fetch can't report upload progress yet.
     */
    sendToStorage(upload: Upload["upload"], file: File, onProgress: (fraction: number) => void): Promise<void> {
      return new Promise((resolve, reject) => {
        const form = new FormData();
        for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
        form.append("file", file); // S3 requires the file to be the last field
        const xhr = new XMLHttpRequest();
        xhr.open("POST", upload.url);
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload refused (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Network error while uploading"));
        xhr.send(form);
      });
    },

    async downloadCsv(from: string, to: string) {
      const res = await rest(`/api/export.csv?from=${from}&to=${to}`);
      return res.blob();
    },

    reportError(report: { message: string; stack?: string; receiptId?: string }) {
      void fetch("/api/telemetry", {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ ...report, url: window.location.pathname, requestId: lastRequestId }),
        keepalive: true,
      }).catch(() => {});
    },
  };
}

export type Api = ReturnType<typeof createApi>;

export function useApi(): Api {
  const auth = useAppAuth();
  return useMemo(() => createApi(auth.headers), [auth]);
}
