// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncouragementFooter, ROTATE_MS } from "@/components/cockpit/encouragement-footer";
import { NOTES_SAVE_DELAY_MS, NotesCard } from "@/components/cockpit/notes-card";
import { ENCOURAGEMENT, encouragementIndex } from "@/lib/encouragement";

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const flush = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const type = (value: string) => fireEvent.change(screen.getByTestId("call-notes"), { target: { value } });

describe("NotesCard", () => {
  it("saves once, shortly after typing stops, and says so", async () => {
    const onSave = vi.fn(async () => null as string | null);
    render(<NotesCard initial="" onSave={onSave} />);
    type("Priya");
    await flush(NOTES_SAVE_DELAY_MS - 100);
    type("Priya trusts numbers.");
    await flush(NOTES_SAVE_DELAY_MS - 100);
    expect(onSave).not.toHaveBeenCalled();
    await flush(200);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("Priya trusts numbers.", false);
    expect(screen.getByTestId("notes-state").textContent).toBe("Saved");
  });

  it("saves on blur without waiting, and not at all when unchanged", async () => {
    const onSave = vi.fn(async () => null as string | null);
    render(<NotesCard initial="existing" onSave={onSave} />);
    fireEvent.blur(screen.getByTestId("call-notes"));
    await flush(0);
    expect(onSave).not.toHaveBeenCalled();
    type("existing, plus more");
    fireEvent.blur(screen.getByTestId("call-notes"));
    await flush(0);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("flushes an unsaved edit when the card goes away (leaving mid-sentence)", async () => {
    const onSave = vi.fn(async () => null as string | null);
    const { unmount } = render(<NotesCard initial="" onSave={onSave} />);
    type("half a sentence");
    unmount();
    await flush(0);
    expect(onSave).toHaveBeenCalledWith("half a sentence", true); // keepalive, so it survives navigation
  });

  it("flushes when the page is hidden", async () => {
    const onSave = vi.fn(async () => null as string | null);
    render(<NotesCard initial="" onSave={onSave} />);
    type("before closing the tab");
    window.dispatchEvent(new Event("pagehide"));
    await flush(0);
    expect(onSave).toHaveBeenCalledWith("before closing the tab", true);
  });

  it("keeps the text and shows the error when saving fails, then retries on the next edit", async () => {
    const onSave = vi.fn().mockResolvedValueOnce("Could not reach the server.").mockResolvedValue(null);
    render(<NotesCard initial="" onSave={onSave} />);
    type("precious");
    await flush(NOTES_SAVE_DELAY_MS + 50);
    expect(screen.getByTestId("notes-error").textContent).toBe("Could not reach the server.");
    expect((screen.getByTestId("call-notes") as HTMLTextAreaElement).value).toBe("precious");
    type("precious, still");
    await flush(NOTES_SAVE_DELAY_MS + 50);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("notes-error")).toBeNull();
  });

  it("promises privacy in plain words", () => {
    render(<NotesCard initial="" onSave={async () => null} />);
    expect((screen.getByTestId("call-notes") as HTMLTextAreaElement).placeholder).toMatch(/never appear in the client's review/);
  });
});

describe("EncouragementFooter", () => {
  it("shows a stable line for the session and rotates slowly", async () => {
    render(<EncouragementFooter seed="s1" />);
    await flush(0);
    expect(screen.getByTestId("encouragement-line").textContent).toContain(ENCOURAGEMENT[encouragementIndex("s1")]!);
    await flush(ROTATE_MS);
    expect(screen.getByTestId("encouragement-line").textContent).toContain(ENCOURAGEMENT[encouragementIndex("s1", 1)]!);
  });

  it("can be switched off, remembers that on this device, and can come back", async () => {
    const { unmount } = render(<EncouragementFooter seed="s1" />);
    await flush(0);
    fireEvent.click(screen.getByTestId("encouragement-toggle"));
    expect(screen.queryByTestId("encouragement-line")).toBeNull();
    unmount();
    render(<EncouragementFooter seed="s1" />);
    await flush(0);
    expect(screen.queryByTestId("encouragement-line")).toBeNull();
    fireEvent.click(screen.getByTestId("encouragement-toggle"));
    expect(screen.getByTestId("encouragement-line")).toBeTruthy();
  });

  it("still works when storage is unavailable", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<EncouragementFooter seed="s1" />);
    await flush(0);
    expect(screen.getByTestId("encouragement-line")).toBeTruthy();
    fireEvent.click(screen.getByTestId("encouragement-toggle"));
    expect(screen.queryByTestId("encouragement-line")).toBeNull();
    get.mockRestore();
    set.mockRestore();
  });
});
