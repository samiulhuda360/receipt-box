import { formatMoney } from "@receipt-box/shared";

import type { ReceiptStatus } from "../gql/graphql";

const STATUS: Record<ReceiptStatus, { label: string; tone: string }> = {
  UPLOADING: { label: "Uploading", tone: "info" },
  PROCESSING: { label: "Reading", tone: "info" },
  NEEDS_REVIEW: { label: "Check me", tone: "warn" },
  REVIEWED: { label: "Done", tone: "ok" },
  FAILED: { label: "Enter by hand", tone: "bad" },
};

export function StatusChip({ status }: { status: ReceiptStatus }) {
  const s = STATUS[status];
  return <span className={`chip chip-${s.tone}`}>{s.label}</span>;
}

export function Money({ cents, muted }: { cents: number | null | undefined; muted?: boolean }) {
  if (cents === null || cents === undefined) return <span className="muted">-</span>;
  return <span className={`money${muted ? " muted" : ""}`}>{formatMoney(cents)}</span>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="spinner" role="status">
      <span aria-hidden="true" />
      {label}
    </span>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <p className="note note-bad" role="alert">
      {error instanceof Error ? error.message : "Something went wrong."}
    </p>
  );
}

export function prettyDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
