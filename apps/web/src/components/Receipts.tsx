import { categoryLabel, formatMoney } from "@receipt-box/shared";
import { Link } from "react-router";

import type { ReceiptFieldsFragment, SummaryQuery } from "../gql/graphql";
import { Money, prettyDate, StatusChip } from "./bits";

export function SummaryCards({ summary }: { summary: SummaryQuery["summary"] }) {
  const max = Math.max(1, ...summary.byCategory.map((c) => c.totalCents));
  return (
    <section className="summary" aria-label="Totals for the period">
      <div className="stat">
        <span className="label">Spent (incl GST)</span>
        <strong>{formatMoney(summary.totalCents)}</strong>
      </div>
      <div className="stat stat-accent">
        <span className="label">GST to claim</span>
        <strong>{formatMoney(summary.gstCents)}</strong>
      </div>
      <div className="stat">
        <span className="label">Receipts</span>
        <strong>{summary.count}</strong>
      </div>
      {summary.byCategory.length > 0 && (
        <div className="card bars">
          <h3>By category</h3>
          <ul>
            {summary.byCategory.map((c) => (
              <li key={c.category}>
                <span className="bar-label">{categoryLabel(c.category)}</span>
                <span className="bar" aria-hidden="true">
                  <span style={{ width: `${(c.totalCents / max) * 100}%` }} />
                </span>
                <Money cents={c.totalCents} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function InboxList({ receipts }: { receipts: ReceiptFieldsFragment[] }) {
  if (!receipts.length) return <p className="muted empty">Nothing to check. New uploads appear here first.</p>;
  return (
    <ul className="inbox">
      {receipts.map((r) => {
        const ready = r.status === "NEEDS_REVIEW" || r.status === "FAILED";
        return (
          <li key={r.id} className="inbox-item">
            <div className="thumb">{r.imageUrl ? <img src={r.imageUrl} alt="" loading="lazy" /> : <span aria-hidden="true">...</span>}</div>
            <div className="inbox-text">
              <strong>{r.vendor ?? r.fileName}</strong>
              <span className="muted">
                {prettyDate(r.date)} · <Money cents={r.totalCents} />
              </span>
            </div>
            <StatusChip status={r.status} />
            {ready ? (
              <Link className="btn btn-small" to={`/receipts/${r.id}`} aria-label={`Check ${r.vendor ?? r.fileName}`}>
                Check
              </Link>
            ) : (
              <span className="btn btn-small btn-ghost" aria-hidden="true">
                Wait
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ReceiptsTable({ receipts }: { receipts: ReceiptFieldsFragment[] }) {
  if (!receipts.length) return <p className="muted empty">No checked receipts in this period yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">Checked receipts in the period</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Vendor</th>
            <th scope="col">Category</th>
            <th scope="col" className="num">
              Total
            </th>
            <th scope="col" className="num">
              GST
            </th>
          </tr>
        </thead>
        <tbody>
          {receipts.map((r) => (
            <tr key={r.id}>
              <td>{prettyDate(r.date)}</td>
              <td>
                <Link to={`/receipts/${r.id}`}>{r.vendor}</Link>
              </td>
              <td>{categoryLabel(r.category)}</td>
              <td className="num">
                <Money cents={r.totalCents} />
              </td>
              <td className="num">
                <Money cents={r.gstCents} muted />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
