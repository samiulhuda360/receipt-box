import { CATEGORIES, type CategoryId, centsToDecimal, formatMoney, gstFromInclusive, parseMoney, receiptInputSchema } from "@receipt-box/shared";
import { useId } from "react";
import { type Resolver, useForm } from "react-hook-form";

import { FieldErrors } from "../api";
import type { ReceiptFieldsFragment, ReceiptInput } from "../gql/graphql";

export type FormValues = { vendor: string; date: string; total: string; gst: string; category: CategoryId; notes: string };

// The API speaks cents (totalCents); the form speaks dollars (total). Map error paths between them.
const FIELD: Record<string, keyof FormValues> = { vendor: "vendor", date: "date", totalCents: "total", gstCents: "gst", category: "category", notes: "notes" };

/** Form strings -> the API input, validated by the same zod schema the server uses. */
export function toInput(v: FormValues): { input?: ReceiptInput; errors: Partial<Record<keyof FormValues, string>> } {
  const errors: Partial<Record<keyof FormValues, string>> = {};
  const totalCents = parseMoney(v.total);
  const gstCents = v.gst.trim() === "" ? 0 : parseMoney(v.gst);
  if (totalCents === null) errors.total = "Enter an amount like 42.50";
  if (gstCents === null) errors.gst = "Enter an amount like 5.53, or 0 if there's no GST";
  // Validate the rest even when an amount is unreadable, so every problem shows at once.
  const r = receiptInputSchema.safeParse({ vendor: v.vendor, date: v.date, totalCents: totalCents ?? 1, gstCents: gstCents ?? 0, category: v.category, notes: v.notes });
  if (!r.success) {
    for (const issue of r.error.issues) {
      const field = FIELD[String(issue.path[0])] ?? "vendor";
      if (field === "gst" && totalCents === null) continue; // GST is checked against the total, which we couldn't read
      errors[field] ??= issue.message;
    }
  }
  if (!r.success || totalCents === null || gstCents === null) return { errors };
  return { input: r.data, errors };
}

const resolver: Resolver<FormValues> = async (values) => {
  const { input, errors } = toInput(values);
  if (input) return { values, errors: {} };
  return { values: {}, errors: Object.fromEntries(Object.entries(errors).map(([k, message]) => [k, { type: "validate", message }])) };
};

function defaults(r: ReceiptFieldsFragment): FormValues {
  return {
    vendor: r.vendor ?? "",
    date: r.date ?? "",
    total: r.totalCents === null ? "" : centsToDecimal(r.totalCents),
    gst: r.gstCents === null ? "" : centsToDecimal(r.gstCents),
    category: r.category,
    notes: r.notes,
  };
}

type Read = { value: string; confidence: number } | null | undefined;

/** "Read from the photo, 92% sure" under each field, so the person knows where to look. */
function ReadHint({ read, reviewed, id }: { read: Read; reviewed: boolean; id: string }) {
  if (reviewed) return null;
  if (!read)
    return (
      <span id={id} className="hint hint-warn">
        Not found on the photo
      </span>
    );
  const sure = Math.round(read.confidence * 100);
  return (
    <span id={id} className={`hint ${read.confidence < 0.8 ? "hint-warn" : ""}`}>
      Read from the photo, {sure}% sure{read.confidence < 0.8 ? ". Please check." : ""}
    </span>
  );
}

export function ReceiptForm({
  receipt,
  onSave,
  saving,
}: {
  receipt: ReceiptFieldsFragment;
  onSave: (input: ReceiptInput) => Promise<unknown>;
  saving: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver, defaultValues: defaults(receipt) });
  const uid = useId();
  const ex = receipt.extraction;
  const reviewed = receipt.status === "REVIEWED";
  const total = parseMoney(watch("total") ?? "");
  const gst = parseMoney(watch("gst") || "0");

  const submit = handleSubmit(async (values) => {
    const { input } = toInput(values);
    if (!input) return;
    try {
      await onSave(input);
    } catch (err) {
      if (err instanceof FieldErrors) {
        for (const [path, message] of Object.entries(err.fields)) setError(FIELD[path] ?? "root", { message });
      } else setError("root", { message: (err as Error).message });
    }
  });

  const describedBy = (name: keyof FormValues, hint = true) => [hint ? `${uid}-${name}-hint` : "", errors[name] ? `${uid}-${name}-error` : ""].filter(Boolean).join(" ") || undefined;
  const fieldError = (name: keyof FormValues) =>
    errors[name] && (
      <span id={`${uid}-${name}-error`} className="field-error" role="alert">
        {errors[name]?.message}
      </span>
    );

  return (
    <form className="receipt-form" onSubmit={submit} noValidate aria-label="Receipt details">
      <div className="field">
        <label className="label" htmlFor={`${uid}-vendor`}>
          Vendor
        </label>
        <input id={`${uid}-vendor`} {...register("vendor")} autoComplete="organization" aria-invalid={!!errors.vendor} aria-describedby={describedBy("vendor")} />
        <ReadHint read={ex?.vendor} reviewed={reviewed} id={`${uid}-vendor-hint`} />
        {fieldError("vendor")}
      </div>

      <div className="field">
        <label className="label" htmlFor={`${uid}-date`}>
          Date
        </label>
        <input id={`${uid}-date`} type="date" {...register("date")} aria-invalid={!!errors.date} aria-describedby={describedBy("date")} />
        <ReadHint read={ex?.date} reviewed={reviewed} id={`${uid}-date-hint`} />
        {fieldError("date")}
      </div>

      <div className="row">
        <div className="field">
          <label className="label" htmlFor={`${uid}-total`}>
            Total incl GST ($)
          </label>
          <input id={`${uid}-total`} inputMode="decimal" {...register("total")} aria-invalid={!!errors.total} aria-describedby={describedBy("total")} />
          <ReadHint read={ex?.total} reviewed={reviewed} id={`${uid}-total-hint`} />
          {fieldError("total")}
        </div>
        <div className="field">
          <label className="label" htmlFor={`${uid}-gst`}>
            GST ($)
          </label>
          <input id={`${uid}-gst`} inputMode="decimal" {...register("gst")} aria-invalid={!!errors.gst} aria-describedby={describedBy("gst")} />
          <ReadHint read={ex?.gst} reviewed={reviewed} id={`${uid}-gst-hint`} />
          {fieldError("gst")}
        </div>
      </div>

      <p className="calc">
        <button
          type="button"
          className="btn btn-small btn-ghost"
          disabled={total === null}
          onClick={() => total !== null && setValue("gst", centsToDecimal(gstFromInclusive(total)), { shouldValidate: true })}
        >
          Set GST to 15% of the total
        </button>
        {total !== null && gst !== null && <span className="muted">Excl GST: {formatMoney(total - gst)}</span>}
      </p>

      <div className="field">
        <label className="label" htmlFor={`${uid}-category`}>
          Category
        </label>
        <select id={`${uid}-category`} {...register("category")}>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${uid}-notes`}>
          Notes (optional)
        </label>
        <textarea id={`${uid}-notes`} rows={2} {...register("notes")} aria-describedby={describedBy("notes", false)} />
        {fieldError("notes")}
      </div>

      {errors.root && (
        <p className="note note-bad" role="alert">
          {errors.root.message}
        </p>
      )}
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? "Saving..." : reviewed ? "Save changes" : "Looks right, save"}
      </button>
    </form>
  );
}
