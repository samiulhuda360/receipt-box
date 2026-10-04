import { isValidIsoDate, type Period, presets, todayIso } from "@receipt-box/shared";
import { useSearchParams } from "react-router";

/** The selected period lives in the URL (?from=&to=), so a view can be bookmarked or shared. */
export function usePeriod(): [Pick<Period, "from" | "to">, (p: Pick<Period, "from" | "to">) => void] {
  const [params, setParams] = useSearchParams();
  const fallback = presets(todayIso())[0]!;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const period = isValidIsoDate(from) && isValidIsoDate(to) && from <= to ? { from, to } : { from: fallback.from, to: fallback.to };
  return [period, (p) => setParams({ from: p.from, to: p.to }, { replace: true })];
}

export function PeriodPicker({ value, onChange }: { value: Pick<Period, "from" | "to">; onChange: (p: Pick<Period, "from" | "to">) => void }) {
  const options = presets(todayIso());
  const match = options.find((o) => o.from === value.from && o.to === value.to);
  return (
    <div className="period" role="group" aria-label="Period">
      <label>
        <span className="label">Period</span>
        <select
          value={match?.id ?? "custom"}
          onChange={(e) => {
            const p = options.find((o) => o.id === e.target.value);
            if (p) onChange(p);
          }}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
          <option value="custom">Custom dates</option>
        </select>
      </label>
      <label>
        <span className="label">From</span>
        <input type="date" value={value.from} max={value.to} onChange={(e) => isValidIsoDate(e.target.value) && onChange({ ...value, from: e.target.value })} />
      </label>
      <label>
        <span className="label">To</span>
        <input type="date" value={value.to} min={value.from} onChange={(e) => isValidIsoDate(e.target.value) && onChange({ ...value, to: e.target.value })} />
      </label>
    </div>
  );
}
