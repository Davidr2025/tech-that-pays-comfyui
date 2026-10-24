// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MicControls } from "@/components/cockpit/mic-controls";
import { FakeRecognition, install, uninstall } from "./fake-recognition";

beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.all = [];
  FakeRecognition.autoStart = true;
  install();
});
afterEach(() => {
  cleanup();
  uninstall();
  vi.useRealTimers();
});

const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const ok = () => vi.fn(async () => null as string | null);

describe("before the browser is checked", () => {
  it("renders nothing on the server, so the server and first client render agree", () => {
    expect(renderToString(<MicControls onLine={ok()} disabled={false} />)).toBe("");
  });
});

describe("a browser without speech recognition", () => {
  it("says so plainly and points back to typing", async () => {
    uninstall();
    render(<MicControls onLine={ok()} disabled={false} />);
    await flush();
    expect(screen.getByTestId("mic-unsupported").textContent).toMatch(/isn.t available in this browser.*Chrome, Edge or Safari.*keep typing/);
    expect(screen.queryByTestId("mic-start")).toBeNull();
  });
});

describe("before listening", () => {
  it("tells the person what the browser does with the audio BEFORE they start", async () => {
    render(<MicControls onLine={ok()} disabled={false} />);
    await flush();
    const note = screen.getByTestId("mic-privacy").textContent!;
    expect(note).toMatch(/may send the audio to its speech service/);
    expect(note).toMatch(/Chrome sends it to Google, Safari to Apple/);
    expect(note).toMatch(/never records or stores audio, only the text/);
    expect(note).toMatch(/Start it only if your client has agreed/);
    expect(FakeRecognition.all).toHaveLength(0); // nothing starts until they choose to
  });

  it("is optional and does not take typing away", async () => {
    render(<MicControls onLine={ok()} disabled={false} />);
    await flush();
    expect(screen.getByText(/Typing below always works/)).toBeTruthy();
  });

  it("cannot be started on a completed session", async () => {
    render(<MicControls onLine={ok()} disabled />);
    await flush();
    expect((screen.getByTestId("mic-start") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("starting", () => {
  it("shows what is happening while the browser decides, offers Cancel, and later a gentle hint", async () => {
    FakeRecognition.autoStart = false;
    render(<MicControls onLine={ok()} disabled={false} />);
    await flush();
    fireEvent.click(screen.getByTestId("mic-start"));
    await flush();
    expect(screen.getByTestId("mic-starting").textContent).toMatch(/Starting the microphone… If your browser asks, choose Allow/);
    expect(screen.queryByTestId("mic-hint")).toBeNull();
    await flush(8100);
    expect(screen.getByTestId("mic-hint").textContent).toMatch(/permission prompt.*keep typing/);
    expect(screen.queryByTestId("mic-error")).toBeNull();
    act(() => FakeRecognition.current().grant());
    await flush();
    expect(screen.getByTestId("mic-listening")).toBeTruthy();
    expect(screen.queryByTestId("mic-starting")).toBeNull();
  });

  it("Cancel returns to the start button", async () => {
    FakeRecognition.autoStart = false;
    render(<MicControls onLine={ok()} disabled={false} />);
    await flush();
    fireEvent.click(screen.getByTestId("mic-start"));
    await flush();
    fireEvent.click(screen.getByTestId("mic-cancel"));
    await flush();
    expect(screen.getByTestId("mic-start")).toBeTruthy();
  });
});

describe("listening", () => {
  async function listening(onLine = ok()) {
    render(<MicControls onLine={onLine} disabled={false} />);
    await flush();
    fireEvent.click(screen.getByTestId("mic-start"));
    await flush();
    return onLine;
  }

  it("shows that it is listening, who is selected, and a Stop button", async () => {
    await listening();
    expect(screen.getByTestId("mic-listening").textContent).toMatch(/Listening/);
    expect(screen.getByTestId("mic-speaker-CONSULTANT").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("mic-speaker-CLIENT").getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("mic-privacy")).toBeNull(); // the note has done its job
    expect(screen.getByTestId("mic-stop")).toBeTruthy();
  });

  it("shows what it is hearing, labelled with who the words are attributed to", async () => {
    await listening();
    act(() => FakeRecognition.current().hear("we use hubspot"));
    expect(screen.getByTestId("mic-interim").textContent).toBe("Hearing (you): we use hubspot");
    fireEvent.click(screen.getByTestId("mic-speaker-CLIENT"));
    expect(screen.getByTestId("mic-speaker-CLIENT").getAttribute("aria-pressed")).toBe("true");
  });

  it("hands saved lines to the cockpit with the right speaker", async () => {
    const onLine = await listening();
    act(() => FakeRecognition.current().finalize("What does a typical week look like?"));
    await flush();
    expect(onLine).toHaveBeenCalledWith("CONSULTANT", "What does a typical week look like?");
    fireEvent.click(screen.getByTestId("mic-speaker-CLIENT"));
    await flush(300);
    act(() => FakeRecognition.current().finalize("Mostly manual reporting."));
    await flush();
    expect(onLine).toHaveBeenLastCalledWith("CLIENT", "Mostly manual reporting.");
  });

  it("Stop returns to the start state", async () => {
    await listening();
    fireEvent.click(screen.getByTestId("mic-stop"));
    await flush();
    expect(screen.getByTestId("mic-start")).toBeTruthy();
    expect(screen.queryByTestId("mic-listening")).toBeNull();
  });

  it("a refused microphone shows the instruction and offers to try again", async () => {
    await listening();
    act(() => FakeRecognition.current().error("not-allowed"));
    act(() => FakeRecognition.current().endByItself());
    await flush();
    expect(screen.getByTestId("mic-error").textContent).toMatch(/Allow the microphone for this site/);
    expect(screen.getByTestId("mic-start").textContent).toMatch(/Try the microphone again/);
  });

  it("says when a line could not be saved, and keeps listening", async () => {
    await listening(vi.fn(async () => "This session is complete."));
    act(() => FakeRecognition.current().finalize("A line the server refuses."));
    await flush();
    expect(screen.getByTestId("mic-save-error").textContent).toBe("A line was not saved: This session is complete.");
    expect(screen.getByTestId("mic-listening")).toBeTruthy();
  });

  it("closing the panel (leaving live mode) stops the microphone", async () => {
    const { unmount } = render(<MicControls onLine={ok()} disabled={false} />);
    await flush();
    fireEvent.click(screen.getByTestId("mic-start"));
    await flush();
    const rec = FakeRecognition.current();
    unmount();
    expect(rec.aborted).toBe(true);
  });
});
