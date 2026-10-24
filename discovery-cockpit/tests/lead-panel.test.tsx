// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeadFinderPanel } from "@/components/lead-finder-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const settings = { enabled: false, niche: "", location: "", source: "" };
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A fetch whose responses we release by hand, so the order they finish in is under the test's control. */
function manualFetch() {
  const calls: { body: Record<string, unknown>; resolve: (status?: number) => void }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => new Promise((resolve) => calls.push({ body: JSON.parse(String(init.body)), resolve: (status = 200) => resolve(new Response(JSON.stringify({ ok: true }), { status })) }))),
  );
  return calls;
}
beforeEach(() => undefined);

describe("saving the intended inputs", () => {
  it("sends one request at a time, and the last thing typed is what ends up saved", async () => {
    const calls = manualFetch();
    render(<LeadFinderPanel settings={settings} leads={[]} total={0} />);
    fireEvent.change(screen.getByTestId("lead-niche"), { target: { value: "Dental" } });
    fireEvent.blur(screen.getByTestId("lead-niche"));
    fireEvent.change(screen.getByTestId("lead-location"), { target: { value: "Mississauga" } });
    fireEvent.blur(screen.getByTestId("lead-location"));
    fireEvent.change(screen.getByTestId("lead-source"), { target: { value: "Referrals" } });
    fireEvent.blur(screen.getByTestId("lead-source"));

    expect(calls).toHaveLength(1); // the later saves wait for the first
    expect(calls[0]!.body).toMatchObject({ niche: "Dental", location: "" });
    calls[0]!.resolve();
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.body).toMatchObject({ niche: "Dental", location: "Mississauga", source: "Referrals" }); // one combined, newest save
    calls[1]!.resolve();
    await waitFor(() => expect(screen.getByTestId("lead-message").textContent).toBe("Saved."));
    expect(calls).toHaveLength(2);
  });

  it("says so, and keeps the text, when a save fails", async () => {
    const calls = manualFetch();
    render(<LeadFinderPanel settings={settings} leads={[]} total={0} />);
    fireEvent.change(screen.getByTestId("lead-niche"), { target: { value: "Dental" } });
    fireEvent.blur(screen.getByTestId("lead-niche"));
    calls[0]!.resolve(500);
    await waitFor(() => expect(screen.getByTestId("lead-message").textContent).toBe("Could not save."));
    expect((screen.getByTestId("lead-niche") as HTMLInputElement).value).toBe("Dental");
  });

  it("a later save still goes out after a failed one", async () => {
    const calls = manualFetch();
    render(<LeadFinderPanel settings={settings} leads={[]} total={0} />);
    fireEvent.change(screen.getByTestId("lead-niche"), { target: { value: "A" } });
    fireEvent.blur(screen.getByTestId("lead-niche"));
    calls[0]!.resolve(500);
    await waitFor(() => expect(screen.getByTestId("lead-message").textContent).toBe("Could not save."));
    fireEvent.change(screen.getByTestId("lead-niche"), { target: { value: "AB" } });
    fireEvent.blur(screen.getByTestId("lead-niche"));
    await waitFor(() => expect(calls).toHaveLength(2)); // the lock was released by the failure
    expect(calls[1]!.body).toMatchObject({ niche: "AB" });
  });

  it("the switch saves straight away", async () => {
    const calls = manualFetch();
    render(<LeadFinderPanel settings={settings} leads={[]} total={0} />);
    fireEvent.click(screen.getByTestId("lead-enabled"));
    expect(calls[0]!.body).toMatchObject({ enabled: true });
  });
});

describe("what the page shows", () => {
  it("is marked Coming soon, and while off offers no import or list", () => {
    render(<LeadFinderPanel settings={settings} leads={[]} total={0} />);
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThan(0);
    expect(screen.getByText(/None of that exists yet/)).toBeTruthy();
    for (const id of ["lead-import", "lead-table", "lead-empty", "lead-file"]) expect(screen.queryByTestId(id), id).toBeNull();
  });

  it("when on, shows the import and either the empty state or the table", () => {
    const { rerender } = render(<LeadFinderPanel settings={{ ...settings, enabled: true }} leads={[]} total={0} />);
    expect(screen.getByTestId("lead-import")).toBeTruthy();
    expect(screen.getByTestId("lead-empty")).toBeTruthy();
    rerender(<LeadFinderPanel settings={{ ...settings, enabled: true }} leads={[{ id: "1", name: "<b>Bold</b>", company: null, email: "a@b.co", phone: null, website: null, niche: null, location: null, source: null }]} total={250} />);
    expect(screen.getAllByTestId("lead-row")).toHaveLength(1);
    expect(screen.getByTestId("lead-row").querySelector("b")).toBeNull(); // markup in a name is text
    expect(screen.getByText(/Showing the newest 1 of 250/)).toBeTruthy();
  });

  it("the import button waits for some text", () => {
    render(<LeadFinderPanel settings={{ ...settings, enabled: true }} leads={[]} total={0} />);
    expect((screen.getByTestId("lead-import") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("lead-csv"), { target: { value: "Name\nA" } });
    expect((screen.getByTestId("lead-import") as HTMLButtonElement).disabled).toBe(false);
  });
});
