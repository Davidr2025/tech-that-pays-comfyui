// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EngineBadge } from "@/components/cockpit/engine-badge";
import { SettingsForm, type ConsultantValues } from "@/components/settings-form";
import { SETTLE_MS, useRemoteAnalysis } from "@/hooks/use-remote-analysis";
import { analyze } from "@/lib/mock-ai/engine";

const analysis = analyze([], { type: "DISCOVERY" });
type Call = { url: string; body: { upTo: number; reset: boolean } };
let calls: Call[];
let respond: (c: Call) => Promise<{ status: number; json: unknown }>;

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  respond = async (c) => ({ status: 200, json: { analysis, provider: "claude", fellBack: false, upTo: c.body.upTo } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const call = { url, body: JSON.parse(String(init.body)) } as Call;
      calls.push(call);
      const r = await respond(call);
      return { ok: r.status < 400, status: r.status, json: async () => r.json } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("useRemoteAnalysis", () => {
  const setup = (initial: { enabled: boolean; upTo: number; epoch?: number }) =>
    renderHook((p: { enabled: boolean; upTo: number; epoch: number }) => useRemoteAnalysis({ sessionId: "s1", ...p }), { initialProps: { epoch: 0, ...initial } });

  it("does nothing at all when the rule-based engine is in use", async () => {
    setup({ enabled: false, upTo: 5 });
    await flush(SETTLE_MS * 5);
    expect(calls).toEqual([]);
  });

  it("waits for a burst of lines to settle, then asks once, telling the server to start from the beginning", async () => {
    const h = setup({ enabled: true, upTo: 1 });
    await flush(SETTLE_MS - 100);
    h.rerender({ enabled: true, upTo: 2, epoch: 0 });
    await flush(SETTLE_MS - 100);
    h.rerender({ enabled: true, upTo: 3, epoch: 0 });
    expect(calls).toHaveLength(0);
    await flush(SETTLE_MS + 50);
    expect(calls).toEqual([{ url: "/api/sessions/s1/analysis", body: { upTo: 3, reset: true } }]);
    expect(h.result.current.answer?.upTo).toBe(3);
    expect(h.result.current.error).toBeNull();
  });

  it("sends later lines as a plain continuation, one request at a time", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const h = setup({ enabled: true, upTo: 2 });
    await flush(SETTLE_MS + 10);
    expect(calls).toHaveLength(1);

    respond = async (c) => {
      if (c.body.upTo === 4) await gate;
      return { status: 200, json: { analysis, provider: "claude", fellBack: false, upTo: c.body.upTo } };
    };
    h.rerender({ enabled: true, upTo: 4, epoch: 0 });
    await flush(SETTLE_MS + 10);
    expect(calls.map((c) => c.body)).toEqual([{ upTo: 2, reset: true }, { upTo: 4, reset: false }]);
    // two more lines arrive while that request is still out: nothing new is sent until it returns
    h.rerender({ enabled: true, upTo: 6, epoch: 0 });
    await flush(SETTLE_MS + 10);
    expect(calls).toHaveLength(2);
    release();
    await flush(10);
    expect(calls.map((c) => c.body.upTo)).toEqual([2, 4, 6]);
  });

  it("keeps the last answer when a request fails, reports it, and tries again on the next line", async () => {
    const h = setup({ enabled: true, upTo: 2 });
    await flush(SETTLE_MS + 10);
    respond = async () => ({ status: 502, json: { error: "Could not analyse the call." } });
    h.rerender({ enabled: true, upTo: 3, epoch: 0 });
    await flush(SETTLE_MS + 10);
    expect(h.result.current.error).toBe("Could not analyse the call.");
    expect(h.result.current.answer?.upTo).toBe(2);
    expect(calls).toHaveLength(2); // no hot loop

    respond = async (c) => ({ status: 200, json: { analysis, provider: "claude", fellBack: false, upTo: c.body.upTo } });
    h.rerender({ enabled: true, upTo: 4, epoch: 0 });
    await flush(SETTLE_MS + 10);
    expect(calls.at(-1)!.body).toEqual({ upTo: 4, reset: false });
    expect(h.result.current.error).toBeNull();
  });

  it("forgets the answer and starts over when the call is replaced or restarted", async () => {
    const h = setup({ enabled: true, upTo: 8 });
    await flush(SETTLE_MS + 10);
    expect(h.result.current.answer).not.toBeNull();
    h.rerender({ enabled: true, upTo: 0, epoch: 1 });
    expect(h.result.current.answer).toBeNull();
    h.rerender({ enabled: true, upTo: 3, epoch: 1 });
    await flush(SETTLE_MS + 10);
    expect(calls.at(-1)!.body).toEqual({ upTo: 3, reset: true });
  });

  it("survives a network failure without throwing", async () => {
    respond = async () => {
      throw new Error("offline");
    };
    const h = setup({ enabled: true, upTo: 2 });
    await flush(SETTLE_MS + 10);
    expect(h.result.current.error).toBe("Could not reach the server.");
    expect(h.result.current.answer).toBeNull();
  });
});

describe("EngineBadge", () => {
  const badge = (engine: Parameters<typeof EngineBadge>[0]["engine"], error: string | null = null) => {
    render(<EngineBadge engine={engine} error={error} />);
    return screen.getByTestId("engine-badge");
  };

  it("says which engine produced the panel", () => {
    expect(badge({ provider: "mock", fellBack: false, waiting: false }).textContent).toBe("Analysis: Rule-based");
    cleanup();
    expect(badge({ provider: "claude", fellBack: false, waiting: false }).textContent).toBe("Analysis: Claude");
  });

  it("is honest when Claude was chosen but the rules are on screen", () => {
    const b = badge({ provider: "mock", fellBack: true, waiting: false }, "Analysis failed (502).");
    expect(b.textContent).toContain("Rule-based · Claude unavailable");
    expect(b.textContent).toContain("Analysis failed (502).");
    expect(b.getAttribute("data-fallback")).toBe("true");
    cleanup();
    expect(badge({ provider: "mock", fellBack: true, waiting: true }).textContent).toContain("waiting for Claude");
  });
});

describe("SettingsForm analysis engine", () => {
  const initial: ConsultantValues = {
    name: "A", email: "a@example.test", businessName: "B", tagline: "", primaryColor: "#0f766e", accentColor: "#d97706", calendarLink: "", embedBooking: false, logoUrl: null, aiProvider: "mock",
  };

  it("offers Claude only when the server has a key, and explains why not", () => {
    render(<SettingsForm initial={initial} claude={{ available: false, model: "claude-opus-5-5" }} />);
    expect((screen.getByTestId("provider-claude") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId("provider-mock") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/this server has no ANTHROPIC_API_KEY/)).toBeTruthy();
  });

  it("saves the choice, and says plainly what choosing Claude means", async () => {
    vi.useRealTimers();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsForm initial={initial} claude={{ available: true, model: "claude-opus-5-5" }} />);
    expect(screen.getByText(/Sends the call's transcript lines to Anthropic \(model claude-opus-5-5\)/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("provider-claude"));
    fireEvent.submit(screen.getByTestId("provider-claude").closest("form")!);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(String(calls[0]![1].body)).aiProvider).toBe("claude");
  });
});
