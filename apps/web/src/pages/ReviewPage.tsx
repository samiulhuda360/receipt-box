import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { ErrorNote, Spinner, StatusChip } from "../components/bits";
import { ReceiptForm } from "../components/ReceiptForm";
import { useDeleteReceipt, useReceipt, useSaveReceipt } from "../hooks";

export function ReviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const receipt = useReceipt(id);
  const save = useSaveReceipt(id);
  const remove = useDeleteReceipt();
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(false);

  if (receipt.isPending) return <Spinner label="Loading receipt" />;
  if (receipt.isError) return <ErrorNote error={receipt.error} />;
  const r = receipt.data;
  if (!r)
    return (
      <div className="center">
        <h1>Receipt not found</h1>
        <Link to="/">Back to receipts</Link>
      </div>
    );

  const busy = r.status === "UPLOADING" || r.status === "PROCESSING";

  return (
    <div className="page">
      <p>
        <Link to="/">&larr; All receipts</Link>
      </p>
      <div className="review">
        <figure className={`card photo${zoom ? " zoomed" : ""}`}>
          {r.imageUrl ? (
            <button type="button" className="photo-btn" onClick={() => setZoom((z) => !z)} aria-label={zoom ? "Zoom out" : "Zoom in"}>
              <img src={r.imageUrl} alt={`Photo of the receipt ${r.fileName}`} />
            </button>
          ) : (
            <Spinner label="Waiting for the upload" />
          )}
          <figcaption className="muted">
            {r.fileName}
            {r.extraction && ` · read by ${r.extraction.engine} in ${(r.extraction.ms / 1000).toFixed(1)} s`}
          </figcaption>
        </figure>

        <section className="card" aria-labelledby="review-title">
          <div className="card-head">
            <h1 id="review-title">{r.status === "REVIEWED" ? "Receipt" : "Check this receipt"}</h1>
            <StatusChip status={r.status} />
          </div>
          {r.error && <p className="note note-warn">{r.error}</p>}
          {busy ? (
            <Spinner label="Reading the receipt. This usually takes a few seconds." />
          ) : (
            <ReceiptForm
              key={r.updatedAt}
              receipt={r}
              saving={save.isPending}
              onSave={async (input) => {
                await save.mutateAsync(input);
                navigate("/", { state: { saved: input.vendor } });
              }}
            />
          )}
          <hr />
          <button type="button" className="btn btn-danger btn-small" onClick={() => dialog.current?.showModal()}>
            Delete receipt
          </button>
        </section>
      </div>

      <dialog ref={dialog} aria-labelledby="delete-title">
        <h2 id="delete-title">Delete this receipt?</h2>
        <p>The photo and its details are removed for good.</p>
        <form method="dialog" className="dialog-actions">
          <button className="btn btn-ghost">Keep it</button>
          <button
            className="btn btn-danger"
            type="button"
            disabled={remove.isPending}
            onClick={async () => {
              await remove.mutateAsync(r.id);
              dialog.current?.close();
              navigate("/");
            }}
          >
            Delete
          </button>
        </form>
      </dialog>
    </div>
  );
}
