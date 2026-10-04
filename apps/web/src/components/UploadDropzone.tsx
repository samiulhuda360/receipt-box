import { MAX_UPLOAD_BYTES, UPLOAD_TYPES } from "@receipt-box/shared";
import { type DragEvent, useId, useRef, useState } from "react";

import type { UploadItem } from "../hooks";

/** Checks done in the browser for instant feedback; the API and the S3 upload policy enforce the same rules. */
export function checkFiles(files: File[]): { ok: File[]; rejected: string[] } {
  const ok: File[] = [];
  const rejected: string[] = [];
  for (const f of files) {
    if (!(UPLOAD_TYPES as readonly string[]).includes(f.type)) rejected.push(`${f.name}: only JPEG and PNG photos`);
    else if (f.size > MAX_UPLOAD_BYTES) rejected.push(`${f.name}: bigger than 10 MB`);
    else ok.push(f);
  }
  return { ok, rejected };
}

export function UploadDropzone({ onFiles, items }: { onFiles: (files: File[]) => void; items: UploadItem[] }) {
  const input = useRef<HTMLInputElement>(null);
  const hint = useId();
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  function take(list: FileList | null) {
    const { ok, rejected } = checkFiles([...(list ?? [])]);
    setRejected(rejected);
    if (ok.length) onFiles(ok);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files);
  }

  return (
    <section className="card upload" aria-labelledby="upload-title">
      <div
        className={`dropzone${dragging ? " dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <svg viewBox="0 0 48 48" aria-hidden="true" className="dropzone-icon">
          <path d="M14 6h20v36l-3.3-2.4L27.3 42 24 39.6 20.7 42l-3.4-2.4L14 42z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M19 15h10M19 21h10M19 27h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <h2 id="upload-title">Add receipts</h2>
        <p id={hint} className="muted">
          Drop photos here, or choose files. JPEG or PNG, up to 10 MB each.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
          Choose photos
        </button>
        <input
          ref={input}
          type="file"
          accept={UPLOAD_TYPES.join(",")}
          capture="environment"
          multiple
          hidden
          aria-describedby={hint}
          data-testid="file-input"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {rejected.length > 0 && (
        <ul className="note note-bad" role="alert">
          {rejected.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <ul className="upload-list" aria-label="Uploads">
          {items.map((i) => (
            <li key={i.key}>
              <span className="upload-name">{i.name}</span>
              {i.error ? (
                <span className="chip chip-bad">{i.error}</span>
              ) : i.done ? (
                <span className="chip chip-ok">Uploaded</span>
              ) : (
                <progress max={1} value={i.progress} aria-label={`Uploading ${i.name}`} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
