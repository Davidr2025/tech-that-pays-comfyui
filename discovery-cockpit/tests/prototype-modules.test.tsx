// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentModule, FinanceModule, NurtureModule, SecurityModule } from "@/components/prototype/modules";
import type { ContentData, FinanceData, NurtureData, SecurityData } from "@/lib/prototype/schema";

afterEach(cleanup);

const content: ContentData = {
  summary: "Drafts.",
  channels: ["LinkedIn"],
  voice: "Plain.",
  drafts: [
    { id: "d1", channel: "LinkedIn", topic: "First", body: "Body one", example: true, status: "pending", edited: false },
    { id: "d2", channel: "LinkedIn", topic: "Second", body: "Body two", example: true, status: "approved", edited: true },
    { id: "d3", channel: "LinkedIn", topic: "Third", body: "Body three", example: true, status: "rejected", edited: false },
  ],
};
const finance: FinanceData = {
  period: "October 2026",
  summary: "Money.",
  note: "Placeholders.",
  lines: [
    { key: "revenue", label: "Revenue", actual: 95000, budget: 100000, source: "stated" },
    { key: "receivables", label: "Receivables", actual: 38000, budget: 24000, source: "example" },
    { key: "payroll", label: "Payroll", actual: 41000, budget: 42500, source: "entered" },
    { key: "overhead", label: "Overhead", actual: 5304, budget: 6000, source: "example" },
  ],
};
const security: SecurityData = {
  summary: "Alerts.",
  feed: [
    { id: "a1", severity: "high", title: "High one", detail: "d", minutesAgo: 4, tool: null, example: true },
    { id: "a2", severity: "high", title: "High two", detail: "d", minutesAgo: 9, tool: "Asana", example: true },
    { id: "a3", severity: "low", title: "Low one", detail: "d", minutesAgo: 70, tool: null, example: true },
  ],
};
const nurture: NurtureData = {
  summary: "Who needs a reply.",
  basis: ["From the call."],
  contacts: [
    { id: "c1", label: "Invented lead", stage: "New", temperature: "hot", daysSinceContact: 1, nextAction: "Reply today.", example: true },
    { id: "c2", label: "Dental Group Ltd", stage: "Proposal", temperature: "warm", daysSinceContact: 3, nextAction: "Call Friday.", example: false },
  ],
};
const ok = () => vi.fn(async () => null as string | null);

describe("a guest (read-only)", () => {
  it("sees every module's content and none of the controls", () => {
    for (const el of [
      <ContentModule key="c" data={content} canEdit={false} edit={ok()} />,
      <FinanceModule key="f" data={finance} canEdit={false} edit={ok()} />,
      <SecurityModule key="s" data={security} canEdit={false} edit={ok()} />,
      <NurtureModule key="n" data={nurture} canEdit={false} edit={ok()} />,
    ]) {
      const { container, unmount } = render(el);
      for (const id of ["draft-approve", "draft-edit", "draft-reject", "draft-undo", "finance-edit", "alert-add", "alert-remove", "contact-add", "contact-remove"]) {
        expect(container.querySelector(`[data-testid="${id}"]`), id).toBeNull();
      }
      unmount();
    }
  });

  it("still sees each draft's persisted state", () => {
    render(<ContentModule data={content} canEdit={false} edit={ok()} />);
    const states = screen.getAllByTestId("draft-status").map((e) => e.textContent);
    expect(states).toEqual(["Waiting for your review", "Approved, ready to publish", "Rejected"]);
    expect(screen.getByTestId("content-count").textContent).toMatch(/^1 of 3 approved/);
  });

  it("can still filter alerts by severity (a view choice, not an edit)", () => {
    render(<SecurityModule data={security} canEdit={false} edit={ok()} />);
    expect(screen.getAllByTestId("alert")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("sev-filter-high"));
    expect(screen.getAllByTestId("alert").map((a) => a.getAttribute("data-level"))).toEqual(["high", "high"]);
  });
});

describe("content drafts (owner)", () => {
  it("approve, reject and undo send the right operation", async () => {
    const edit = ok();
    render(<ContentModule data={content} canEdit edit={edit} />);
    fireEvent.click(screen.getByTestId("draft-approve"));
    await waitFor(() => expect(edit).toHaveBeenCalledWith({ op: "draft", draftId: "d1", status: "approved" }));
    fireEvent.click(screen.getByTestId("draft-reject"));
    await waitFor(() => expect(edit).toHaveBeenCalledWith({ op: "draft", draftId: "d1", status: "rejected" }));
    const undo = screen.getAllByTestId("draft-undo");
    expect(undo).toHaveLength(2); // the approved and the rejected one
    fireEvent.click(undo[0]!);
    await waitFor(() => expect(edit).toHaveBeenCalledWith({ op: "draft", draftId: "d2", status: "pending" }));
  });

  it("an edit is typed locally and only sent on Save", async () => {
    const edit = ok();
    render(<ContentModule data={content} canEdit edit={edit} />);
    fireEvent.click(screen.getByTestId("draft-edit"));
    const box = screen.getByTestId("draft-editor") as HTMLTextAreaElement;
    expect(box.value).toBe("Body one");
    fireEvent.change(box, { target: { value: "A better body" } });
    expect(edit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("draft-save"));
    await waitFor(() => expect(edit).toHaveBeenCalledWith({ op: "draft", draftId: "d1", body: "A better body" }));
    await waitFor(() => expect(screen.queryByTestId("draft-editor")).toBeNull());
  });

  it("cancelling an edit sends nothing, and an error keeps the editor open with the text", async () => {
    const edit = vi.fn(async () => "That draft no longer exists.");
    render(<ContentModule data={content} canEdit edit={edit} />);
    fireEvent.click(screen.getByTestId("draft-edit"));
    fireEvent.change(screen.getByTestId("draft-editor"), { target: { value: "typed" } });
    fireEvent.click(screen.getByTestId("draft-save"));
    await waitFor(() => expect(screen.getByTestId("edit-error").textContent).toBe("That draft no longer exists."));
    expect((screen.getByTestId("draft-editor") as HTMLTextAreaElement).value).toBe("typed");
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("draft-editor")).toBeNull();
  });

  it("marks an edited draft", () => {
    render(<ContentModule data={content} canEdit={false} edit={ok()} />);
    expect(screen.getAllByText("Edited")).toHaveLength(1);
  });
});

describe("financial figures (owner)", () => {
  it("opens with the current numbers and sends every line as numbers", async () => {
    const edit = ok();
    render(<FinanceModule data={finance} canEdit edit={edit} />);
    fireEvent.click(screen.getByTestId("finance-edit"));
    const actual = screen.getByTestId("fin-actual-revenue") as HTMLInputElement;
    expect(actual.value).toBe("95000");
    expect((screen.getByTestId("fin-budget-payroll") as HTMLInputElement).value).toBe("42500");
    fireEvent.change(actual, { target: { value: "120000" } });
    fireEvent.change(screen.getByTestId("fin-budget-revenue"), { target: { value: "150000" } });
    fireEvent.click(screen.getByTestId("finance-save"));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    const op = (edit.mock.calls[0] as unknown as [{ op: string; lines: { key: string; actual: number; budget: number }[] }])[0];
    expect(op.op).toBe("finance");
    expect(op.lines).toHaveLength(4);
    expect(op.lines.find((l) => l.key === "revenue")).toEqual({ key: "revenue", actual: 120000, budget: 150000 });
    expect(op.lines.every((l) => typeof l.actual === "number" && typeof l.budget === "number")).toBe(true);
  });

  it("shows the server's message and stays open when refused", async () => {
    render(<FinanceModule data={finance} canEdit edit={vi.fn(async () => "A budget must be above zero.")} />);
    fireEvent.click(screen.getByTestId("finance-edit"));
    fireEvent.click(screen.getByTestId("finance-save"));
    await waitFor(() => expect(within(screen.getByTestId("finance-dialog")).getByTestId("edit-error").textContent).toMatch(/above zero/));
    expect(screen.getByTestId("finance-dialog")).toBeTruthy();
  });

  it("says where the actuals came from using the lines as they are now", () => {
    render(<FinanceModule data={finance} canEdit={false} edit={ok()} />);
    expect(screen.getByTestId("finance-provenance").textContent).toBe("1 of 4 actuals come from your call, 1 was entered, 2 are examples.");
  });

  it("labels each line by where it came from, and works the bars out from the data", () => {
    render(<FinanceModule data={finance} canEdit={false} edit={ok()} />);
    const lines = screen.getAllByTestId("finance-line");
    const badge = (key: string) => within(lines.find((l) => l.getAttribute("data-key") === key)!).queryByText(/From your call|Entered|Example/)?.textContent;
    expect(badge("revenue")).toBe("From your call");
    expect(badge("payroll")).toBe("Entered");
    expect(badge("overhead")).toBe("Example");
    const payroll = lines.find((l) => l.getAttribute("data-key") === "payroll")!;
    expect(within(payroll).getByTestId("finance-used").textContent).toMatch(/^96% of budget used/);
    expect(within(payroll).getByTestId("finance-remaining").textContent).toBe("$1,500 remaining");
  });
});

describe("security alerts (owner)", () => {
  it("filters by severity, with counts, and says so when a level is empty", () => {
    render(<SecurityModule data={security} canEdit edit={ok()} />);
    expect(screen.getByTestId("sev-filter-all").textContent).toBe("All (3)");
    expect(screen.getByTestId("sev-filter-high").textContent).toBe("High (2)");
    expect(screen.getByTestId("sev-filter-medium").textContent).toBe("Medium (0)");
    fireEvent.click(screen.getByTestId("sev-filter-medium"));
    expect(screen.getByTestId("security-empty").textContent).toBe("No alerts at this severity.");
    expect(screen.getByTestId("sev-filter-medium").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("sev-filter-all"));
    expect(screen.getAllByTestId("alert")).toHaveLength(3);
  });

  it("adds an alert from the form, and clears the form after success", async () => {
    const edit = ok();
    render(<SecurityModule data={security} canEdit edit={edit} />);
    fireEvent.click(screen.getByTestId("alert-add"));
    fireEvent.change(screen.getByTestId("alert-severity"), { target: { value: "high" } });
    fireEvent.change(screen.getByTestId("alert-title"), { target: { value: "Shared login" } });
    fireEvent.click(screen.getByTestId("alert-save"));
    await waitFor(() => expect(edit).toHaveBeenCalledWith({ op: "alert.add", severity: "high", title: "Shared login", detail: "", tool: null }));
    await waitFor(() => expect(screen.queryByTestId("alert-form")).toBeNull());
  });

  it("removes an alert", async () => {
    const edit = ok();
    render(<SecurityModule data={security} canEdit edit={edit} />);
    fireEvent.click(screen.getAllByTestId("alert-remove")[1]!);
    await waitFor(() => expect(edit).toHaveBeenCalledWith({ op: "alert.remove", alertId: "a2" }));
  });

  it("says the form's alerts are examples (honesty about what is typed in)", () => {
    render(<SecurityModule data={security} canEdit edit={ok()} />);
    fireEvent.click(screen.getByTestId("alert-add"));
    expect(screen.getByTestId("alert-form").textContent).toMatch(/Example label/);
  });
});

describe("contacts (owner)", () => {
  it("labels only invented contacts as examples", () => {
    render(<NurtureModule data={nurture} canEdit={false} edit={ok()} />);
    const rows = screen.getByTestId("nurture-list").querySelectorAll("li");
    expect(within(rows[0] as HTMLElement).queryByText("Example")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).queryByText("Example")).toBeNull();
  });

  it("adds a contact with the typed values", async () => {
    const edit = ok();
    render(<NurtureModule data={nurture} canEdit edit={edit} />);
    fireEvent.click(screen.getByTestId("contact-add"));
    fireEvent.change(screen.getByTestId("contact-label"), { target: { value: "Acme Heating" } });
    fireEvent.change(screen.getByTestId("contact-temp"), { target: { value: "hot" } });
    fireEvent.change(screen.getByTestId("contact-days"), { target: { value: "12" } });
    fireEvent.change(screen.getByTestId("contact-action"), { target: { value: "Send the quote." } });
    fireEvent.click(screen.getByTestId("contact-save"));
    await waitFor(() => expect(edit).toHaveBeenCalledWith({ op: "contact.add", label: "Acme Heating", stage: "", temperature: "hot", daysSinceContact: 12, nextAction: "Send the quote." }));
  });

  it("removes a contact, and an empty list says so", async () => {
    const edit = ok();
    const { rerender } = render(<NurtureModule data={nurture} canEdit edit={edit} />);
    fireEvent.click(screen.getAllByTestId("contact-remove")[1]!);
    await waitFor(() => expect(edit).toHaveBeenCalledWith({ op: "contact.remove", contactId: "c2" }));
    rerender(<NurtureModule data={{ ...nurture, contacts: [] }} canEdit edit={edit} />);
    expect(screen.getByText("No contacts yet.")).toBeTruthy();
  });
});
