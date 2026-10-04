import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { FieldErrors } from "../api";
import { ReceiptForm, toInput } from "../components/ReceiptForm";
import { InboxList, ReceiptsTable, SummaryCards } from "../components/Receipts";
import { checkFiles, UploadDropzone } from "../components/UploadDropzone";
import type { ReceiptFieldsFragment } from "../gql/graphql";

const receipt = (over: Partial<ReceiptFieldsFragment> = {}): ReceiptFieldsFragment => ({
  id: "r1",
  status: "NEEDS_REVIEW",
  fileName: "mitre10.jpg",
  vendor: "Mitre 10",
  date: "2026-09-12",
  totalCents: 4240,
  gstCents: null,
  category: "TOOLS",
  notes: "",
  imageUrl: "/local-blob/x",
  error: null,
  createdAt: "2026-09-12T01:00:00Z",
  updatedAt: "2026-09-12T01:00:05Z",
  extraction: {
    engine: "tesseract",
    ms: 2100,
    vendor: { value: "Mitre 10", confidence: 0.91 },
    date: { value: "2026-09-12", confidence: 0.62 },
    total: { value: "42.40", confidence: 0.88 },
    gst: null,
  },
  ...over,
});

describe("toInput (form -> API)", () => {
  const base = { vendor: "Z Energy", date: "2026-09-01", total: "80.50", gst: "10.50", category: "VEHICLE" as const, notes: "" };

  it("turns dollars into cents and treats an empty GST as zero", () => {
    expect(toInput(base).input).toMatchObject({ totalCents: 8050, gstCents: 1050 });
    expect(toInput({ ...base, gst: "" }).input).toMatchObject({ gstCents: 0 });
  });

  it("maps validation errors back to the form's field names", () => {
    expect(toInput({ ...base, total: "eighty" }).errors).toEqual({ total: "Enter an amount like 42.50" });
    expect(toInput({ ...base, gst: "50.00" }).errors.gst).toMatch(/3\/23/);
  });
});

describe("ReceiptForm", () => {
  it("says how sure the reader was and flags what to check", () => {
    render(<ReceiptForm receipt={receipt()} onSave={vi.fn()} saving={false} />);
    expect(screen.getByText("Read from the photo, 91% sure")).toBeInTheDocument();
    expect(screen.getByText("Read from the photo, 62% sure. Please check.")).toBeInTheDocument();
    expect(screen.getByText("Not found on the photo")).toBeInTheDocument(); // GST
    expect(screen.getByLabelText("Vendor")).toHaveValue("Mitre 10");
  });

  it("fills GST from the total and saves cents", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ReceiptForm receipt={receipt()} onSave={onSave} saving={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Set GST to 15% of the total" }));
    expect(screen.getByLabelText("GST ($)")).toHaveValue("5.53");
    expect(screen.getByText("Excl GST: $36.87")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Looks right, save" }));
    expect(onSave).toHaveBeenCalledWith({ vendor: "Mitre 10", date: "2026-09-12", totalCents: 4240, gstCents: 553, category: "TOOLS", notes: "" });
  });

  it("blocks bad input before it reaches the server", async () => {
    const onSave = vi.fn();
    render(<ReceiptForm receipt={receipt({ vendor: null })} onSave={onSave} saving={false} />);
    await userEvent.clear(screen.getByLabelText("Total incl GST ($)"));
    await userEvent.type(screen.getByLabelText("Total incl GST ($)"), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Looks right, save" }));
    expect(await screen.findByText("Who did you pay?")).toBeInTheDocument();
    expect(screen.getByText("Enter an amount like 42.50")).toBeInTheDocument();
    expect(screen.getByLabelText("Vendor")).toHaveAttribute("aria-invalid", "true");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the server's field errors next to the right field", async () => {
    const onSave = vi.fn().mockRejectedValue(new FieldErrors("Check the highlighted fields", { gstCents: "GST can't be more than 3/23 of the total (15% GST)" }));
    render(<ReceiptForm receipt={receipt({ gstCents: 500 })} onSave={onSave} saving={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Looks right, save" }));
    const gst = screen.getByLabelText("GST ($)");
    expect(await screen.findByText("GST can't be more than 3/23 of the total (15% GST)")).toBeInTheDocument();
    expect(gst).toHaveAttribute("aria-invalid", "true");
  });
});

describe("UploadDropzone", () => {
  const png = new File([new Uint8Array(100)], "receipt.png", { type: "image/png" });
  const pdf = new File([new Uint8Array(100)], "invoice.pdf", { type: "application/pdf" });

  it("accepts photos and explains why other files are refused", async () => {
    const onFiles = vi.fn();
    render(<UploadDropzone onFiles={onFiles} items={[]} />);
    await userEvent.upload(screen.getByTestId("file-input"), [png, pdf], { applyAccept: false });
    expect(onFiles).toHaveBeenCalledWith([png]);
    expect(screen.getByRole("alert")).toHaveTextContent("invoice.pdf: only JPEG and PNG photos");
  });

  it("refuses files over 10 MB", () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "huge.jpg", { type: "image/jpeg" });
    expect(checkFiles([big]).rejected).toEqual(["huge.jpg: bigger than 10 MB"]);
  });

  it("shows progress for each upload", () => {
    render(<UploadDropzone onFiles={vi.fn()} items={[{ key: "a", name: "a.jpg", progress: 0.4 }, { key: "b", name: "b.jpg", progress: 1, done: true }]} />);
    expect(screen.getByLabelText("Uploading a.jpg")).toHaveAttribute("value", "0.4");
    expect(screen.getByText("Uploaded")).toBeInTheDocument();
  });
});

describe("receipt lists", () => {
  it("lets you check read receipts and asks you to wait for the rest", () => {
    render(
      <MemoryRouter>
        <InboxList receipts={[receipt(), receipt({ id: "r2", status: "PROCESSING", vendor: null, fileName: "new.png" })]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Check Mitre 10" })).toHaveAttribute("href", "/receipts/r1");
    const busy = screen.getByText("new.png").closest("li")!;
    expect(within(busy).getByText("Reading")).toBeInTheDocument();
    expect(within(busy).queryByRole("link")).toBeNull();
  });

  it("formats money in NZD with GST alongside", () => {
    render(
      <MemoryRouter>
        <ReceiptsTable receipts={[receipt({ status: "REVIEWED", totalCents: 123456, gstCents: 16103 })]} />
      </MemoryRouter>,
    );
    const row = screen.getByRole("row", { name: /Mitre 10/ });
    expect(row).toHaveTextContent("$1,234.56");
    expect(row).toHaveTextContent("$161.03");
    expect(row).toHaveTextContent("Tools and equipment");
  });

  it("summarises the period", () => {
    render(
      <SummaryCards
        summary={{ from: "2026-09-01", to: "2026-09-30", count: 2, totalCents: 12650, gstCents: 1650, byCategory: [{ category: "TOOLS", count: 2, totalCents: 12650, gstCents: 1650 }] }}
      />,
    );
    expect(screen.getByText("GST to claim").nextSibling).toHaveTextContent("$16.50");
    expect(screen.getByText("Tools and equipment")).toBeInTheDocument();
  });
});
