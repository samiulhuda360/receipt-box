import { formatMoney } from "@receipt-box/shared";
import { useState } from "react";

import { useApi } from "../api";
import { ErrorNote, Spinner } from "../components/bits";
import { PeriodPicker, usePeriod } from "../components/PeriodPicker";
import { useSummary } from "../hooks";

export function ExportPage() {
  const api = useApi();
  const [period, setPeriod] = usePeriod();
  const summary = useSummary(period);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const blob = await api.downloadCsv(period.from, period.to);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `receipts-${period.from}-to-${period.to}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <h1>Export for your GST return</h1>
      <p className="muted">One row per checked receipt: date, vendor, category, total, GST and the amount excluding GST. Opens in Excel or Google Sheets.</p>
      <section className="card">
        <PeriodPicker value={period} onChange={setPeriod} />
        {summary.isPending ? (
          <Spinner label="Loading totals" />
        ) : summary.data ? (
          <dl className="totals">
            <div>
              <dt>Receipts</dt>
              <dd>{summary.data.count}</dd>
            </div>
            <div>
              <dt>Total incl GST</dt>
              <dd>{formatMoney(summary.data.totalCents)}</dd>
            </div>
            <div>
              <dt>GST on purchases</dt>
              <dd>{formatMoney(summary.data.gstCents)}</dd>
            </div>
          </dl>
        ) : null}
        {error ? <ErrorNote error={error} /> : null}
        <button type="button" className="btn btn-primary" onClick={download} disabled={busy || summary.data?.count === 0}>
          {busy ? "Preparing..." : "Download CSV"}
        </button>
      </section>
    </div>
  );
}
