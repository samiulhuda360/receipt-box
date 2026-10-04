import { ErrorNote, Spinner } from "../components/bits";
import { PeriodPicker, usePeriod } from "../components/PeriodPicker";
import { InboxList, ReceiptsTable, SummaryCards } from "../components/Receipts";
import { UploadDropzone } from "../components/UploadDropzone";
import { useInbox, useReceipts, useSummary, useUploads } from "../hooks";

export function ReceiptsPage() {
  const [period, setPeriod] = usePeriod();
  const inbox = useInbox();
  const receipts = useReceipts(period);
  const summary = useSummary(period);
  const uploads = useUploads();
  const waiting = inbox.data?.filter((r) => r.status === "NEEDS_REVIEW" || r.status === "FAILED").length ?? 0;

  return (
    <div className="page">
      <div className="columns">
        <div className="col-main">
          <UploadDropzone onFiles={(files) => void uploads.upload(files)} items={uploads.items} />

          <section className="card" aria-labelledby="inbox-title">
            <div className="card-head">
              <h2 id="inbox-title">To check {waiting > 0 && <span className="count">{waiting}</span>}</h2>
              {inbox.isFetching && <Spinner label="Updating" />}
            </div>
            {inbox.isPending ? <Spinner label="Loading" /> : inbox.isError ? <ErrorNote error={inbox.error} /> : <InboxList receipts={inbox.data} />}
          </section>
        </div>

        <div className="col-side">
          <section className="card" aria-labelledby="period-title">
            <h2 id="period-title">Totals</h2>
            <PeriodPicker value={period} onChange={setPeriod} />
            {summary.isPending ? <Spinner label="Loading totals" /> : summary.isError ? <ErrorNote error={summary.error} /> : <SummaryCards summary={summary.data} />}
          </section>
        </div>
      </div>

      <section className="card" aria-labelledby="ledger-title">
        <h2 id="ledger-title">Checked receipts</h2>
        {receipts.isPending ? <Spinner label="Loading receipts" /> : receipts.isError ? <ErrorNote error={receipts.error} /> : <ReceiptsTable receipts={receipts.data} />}
      </section>
    </div>
  );
}
