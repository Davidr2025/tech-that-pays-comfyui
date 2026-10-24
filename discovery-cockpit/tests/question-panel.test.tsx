// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionPanel, type QuestionRow } from "@/components/cockpit/question-panel";

const row = (id: string, over: Partial<QuestionRow> = {}): QuestionRow => ({
  id,
  topic: `topic_${id}`,
  text: `Question ${id}?`,
  checked: false,
  byAI: false,
  notes: "",
  custom: false,
  ...over,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(rows: QuestionRow[], over: Partial<Parameters<typeof QuestionPanel>[0]> = {}) {
  const props = {
    onToggle: vi.fn(),
    onEdit: vi.fn(async () => null as string | null),
    onNotes: vi.fn(async () => null as string | null),
    onDelete: vi.fn(async () => null as string | null),
    onAdd: vi.fn(async () => null as string | null),
    locked: false,
    ...over,
  };
  const view = render(<QuestionPanel rows={rows} {...props} />);
  const rerender = (next: QuestionRow[]) => view.rerender(<QuestionPanel rows={next} {...props} />);
  return { props, rerender };
}

const rowOf = (id: string) => screen.getByText(`Question ${id}?`).closest('[data-testid="question-row"]') as HTMLElement;
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("sections", () => {
  it("splits what is left from what is covered, with counts", () => {
    setup([row("a"), row("b", { checked: true }), row("c")]);
    expect(screen.getByTestId("not-asked-toggle").textContent).toContain("Not yet asked (2)");
    expect(screen.getByTestId("covered-toggle").textContent).toContain("Covered (1)");
    expect(within(screen.getByTestId("not-asked")).getAllByTestId("question-row")).toHaveLength(2);
    expect(screen.getByTestId("question-progress").textContent).toBe("1 of 3 covered");
  });

  it("has no Covered section until something is covered, and says so when everything is", () => {
    const { rerender } = setup([row("a")]);
    expect(screen.queryByTestId("covered")).toBeNull();
    rerender([row("a", { checked: true })]);
    expect(screen.getByTestId("not-asked").textContent).toContain("Everything on the list is covered.");
  });

  it("collapses and expands", () => {
    setup([row("a")]);
    const section = screen.getByTestId("not-asked") as HTMLDetailsElement;
    expect(section.open).toBe(true);
    fireEvent.click(screen.getByTestId("not-asked-toggle"));
    expect(section.open).toBe(false);
  });

  it("ticking calls back with the row; the action icons do not tick", () => {
    const { props } = setup([row("a")]);
    fireEvent.click(within(rowOf("a")).getByRole("checkbox"));
    expect(props.onToggle).toHaveBeenCalledTimes(1);
    fireEvent.click(within(rowOf("a")).getByTestId("question-notes-toggle"));
    fireEvent.click(within(rowOf("a")).getByTestId("question-edit"));
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("private notes", () => {
  const open = (id: string) => {
    fireEvent.click(within(rowOf(id)).getByTestId("question-notes-toggle"));
    return within(rowOf(id)).getByTestId("question-notes") as HTMLTextAreaElement;
  };

  it("autosaves shortly after typing stops, once", async () => {
    const { props } = setup([row("a")]);
    const box = open("a");
    fireEvent.change(box, { target: { value: "Ask about " } });
    await flush(400);
    fireEvent.change(box, { target: { value: "Ask about the retainer" } });
    await flush(400);
    expect(props.onNotes).not.toHaveBeenCalled(); // the second keystroke restarted the wait
    await flush(400);
    expect(props.onNotes).toHaveBeenCalledTimes(1);
    expect(props.onNotes).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "Ask about the retainer");
  });

  it("still saves while the rows keep changing, as they do on every played segment", async () => {
    const { props, rerender } = setup([row("a")]);
    const box = open("a");
    fireEvent.change(box, { target: { value: "typing during playback" } });
    for (let t = 0; t < 1200; t += 200) {
      rerender([row("a")]); // a new array, as the cockpit produces for each segment
      await flush(200);
    }
    expect(props.onNotes).toHaveBeenCalledTimes(1);
  });

  it("saves immediately on blur", async () => {
    const { props } = setup([row("a")]);
    const box = open("a");
    fireEvent.change(box, { target: { value: "note" } });
    fireEvent.blur(box);
    await flush(0);
    expect(props.onNotes).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "note");
  });

  it("does not save when nothing changed", async () => {
    const { props } = setup([row("a", { notes: "same" })]);
    const box = open("a");
    fireEvent.change(box, { target: { value: "same " } });
    await flush(1000);
    expect(props.onNotes).not.toHaveBeenCalled();
  });

  it("keeps what you typed when the row moves to Covered mid-note (regression: it was lost)", async () => {
    const { props, rerender } = setup([row("a"), row("b")]);
    const box = open("a");
    fireEvent.change(box, { target: { value: "half a thought" } });
    await flush(300);
    // The engine detects the topic while you are typing: the row changes section and remounts.
    rerender([row("a", { checked: true, byAI: true }), row("b")]);
    expect(within(screen.getByTestId("covered")).getByText("Question a?")).toBeTruthy();
    const moved = within(rowOf("a")).getByTestId("question-notes") as HTMLTextAreaElement;
    expect(moved.value).toBe("half a thought"); // still open, still there
    await flush(700);
    expect(props.onNotes).toHaveBeenCalledTimes(1);
    expect(props.onNotes).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "half a thought");
  });

  it("keeps the draft and shows the error when a save fails", async () => {
    const { props } = setup([row("a")], { onNotes: vi.fn(async () => "Could not reach the server.") });
    const box = open("a");
    fireEvent.change(box, { target: { value: "precious" } });
    await flush(800);
    expect(props.onNotes).toHaveBeenCalled();
    expect(within(rowOf("a")).getByTestId("question-error").textContent).toBe("Could not reach the server.");
    expect((within(rowOf("a")).getByTestId("question-notes") as HTMLTextAreaElement).value).toBe("precious");
  });
});

describe("rewording", () => {
  it("saves on Enter and closes", async () => {
    const { props } = setup([row("a")]);
    fireEvent.click(within(rowOf("a")).getByTestId("question-edit"));
    const input = screen.getByTestId("question-edit-input") as HTMLInputElement;
    expect(input.value).toBe("Question a?");
    fireEvent.change(input, { target: { value: "A better way to ask?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await flush(0);
    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "A better way to ask?");
    expect(screen.queryByTestId("question-edit-input")).toBeNull();
  });

  it("stays open with the message when the server refuses", async () => {
    setup([row("a")], { onEdit: vi.fn(async () => "A question needs at least a few words.") });
    fireEvent.click(within(rowOf("a")).getByTestId("question-edit"));
    fireEvent.change(screen.getByTestId("question-edit-input"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("question-edit-save"));
    await flush(0);
    expect(screen.getByTestId("question-error").textContent).toMatch(/few words/);
    expect(screen.getByTestId("question-edit-input")).toBeTruthy();
  });

  it("Escape abandons the edit", () => {
    const { props } = setup([row("a")]);
    fireEvent.click(within(rowOf("a")).getByTestId("question-edit"));
    fireEvent.change(screen.getByTestId("question-edit-input"), { target: { value: "changed" } });
    fireEvent.keyDown(screen.getByTestId("question-edit-input"), { key: "Escape" });
    expect(screen.queryByTestId("question-edit-input")).toBeNull();
    expect(props.onEdit).not.toHaveBeenCalled();
  });
});

describe("deleting", () => {
  it("needs a second click", async () => {
    const { props } = setup([row("a")]);
    fireEvent.click(within(rowOf("a")).getByTestId("question-delete"));
    expect(props.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("No"));
    expect(screen.queryByTestId("question-delete-confirm")).toBeNull();
    fireEvent.click(within(rowOf("a")).getByTestId("question-delete"));
    fireEvent.click(screen.getByTestId("question-delete-confirm"));
    await flush(0);
    expect(props.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });
});

describe("adding", () => {
  it("is disabled until there is text, then submits and clears", async () => {
    const { props } = setup([row("a")]);
    const button = screen.getByTestId("add-question") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const input = screen.getByTestId("add-question-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "What did the last agency miss?" } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await flush(0);
    expect(props.onAdd).toHaveBeenCalledWith("What did the last agency miss?");
    expect(input.value).toBe("");
  });

  it("keeps the text and shows the message when refused", async () => {
    setup([row("a")], { onAdd: vi.fn(async () => "Keep a question under 300 characters.") });
    const input = screen.getByTestId("add-question-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "too long" } });
    fireEvent.click(screen.getByTestId("add-question"));
    await flush(0);
    expect(screen.getByTestId("add-question-error").textContent).toMatch(/under 300/);
    expect(input.value).toBe("too long");
  });

  it("marks your own questions", () => {
    setup([row("a", { custom: true })]);
    expect(within(rowOf("a")).getByTestId("custom-badge").textContent).toBe("Yours");
  });
});

describe("a completed session", () => {
  it("hides editing, deleting and adding, but notes still work", () => {
    setup([row("a")], { locked: true });
    expect(screen.queryByTestId("add-question-input")).toBeNull();
    expect(within(rowOf("a")).queryByTestId("question-edit")).toBeNull();
    expect(within(rowOf("a")).queryByTestId("question-delete")).toBeNull();
    expect(within(rowOf("a")).getByTestId("question-notes-toggle")).toBeTruthy();
  });
});
