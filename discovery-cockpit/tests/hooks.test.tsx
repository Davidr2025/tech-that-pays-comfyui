// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { segmentDurationMs, usePlayer } from "@/hooks/use-player";
import { useTalkTimer } from "@/hooks/use-talk-timer";
import { isOverTarget } from "@/lib/talk-timer";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/**
 * Moves fake time forward in small steps, flushing React between them. The player schedules its
 * next timeout from an effect, so one giant jump inside a single act() would never let it run.
 */
function advance(ms: number, step = 50) {
  for (let t = 0; t < ms; t += step) act(() => vi.advanceTimersByTime(Math.min(step, ms - t)));
}

describe("useTalkTimer", () => {
  it("counts real time accurately (regression: ticks were being dropped)", () => {
    const { result } = renderHook(() => useTalkTimer(1));
    act(() => result.current.start());
    advance(10_000);
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(9_900);
    expect(result.current.elapsedMs).toBeLessThanOrEqual(10_100);
  });

  it("runs the call clock at the playback speed", () => {
    const { result } = renderHook(() => useTalkTimer(8));
    act(() => result.current.start());
    advance(5_000);
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(39_000);
    expect(result.current.elapsedMs).toBeLessThanOrEqual(41_000);
  });

  it("follows a speed change mid-run", () => {
    const { result, rerender } = renderHook(({ speed }) => useTalkTimer(speed), { initialProps: { speed: 1 } });
    act(() => result.current.start());
    advance(2_000);
    rerender({ speed: 4 });
    advance(2_000);
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(9_800);
    expect(result.current.elapsedMs).toBeLessThanOrEqual(10_200);
  });

  it("keeps the partial interval when stopped between ticks", () => {
    const { result } = renderHook(() => useTalkTimer(1));
    act(() => result.current.start());
    advance(1_050, 50); // 10 full ticks plus 50ms that no tick has counted yet
    act(() => result.current.stop());
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(1_040);
    expect(result.current.elapsedMs).toBeLessThanOrEqual(1_060);
  });

  it("stops, resumes and resets", () => {
    const { result } = renderHook(() => useTalkTimer(1));
    act(() => result.current.start());
    advance(3_000);
    act(() => result.current.stop());
    const frozen = result.current.elapsedMs;
    advance(5_000);
    expect(result.current.elapsedMs).toBe(frozen);
    act(() => result.current.start());
    advance(1_000);
    expect(result.current.elapsedMs).toBeGreaterThan(frozen);
    act(() => result.current.reset());
    expect(result.current.elapsedMs).toBe(0);
  });

  it("passes the warning threshold at the target (20s minimum, 60s maximum)", () => {
    const { result } = renderHook(() => useTalkTimer(1));
    act(() => result.current.start());
    advance(19_000);
    expect(isOverTarget(result.current.elapsedMs, 20)).toBe(false);
    advance(2_000);
    expect(isOverTarget(result.current.elapsedMs, 20)).toBe(true);
    expect(isOverTarget(result.current.elapsedMs, 60)).toBe(false);
  });
});

describe("usePlayer", () => {
  const segs = [{ text: "one two three four five" }, { text: "six seven" }, { text: "eight nine ten" }];

  it("is idle until played, then reveals segments on a call-paced schedule", () => {
    const { result } = renderHook(() => usePlayer(segs, 1));
    expect(result.current).toMatchObject({ status: "idle", playedCount: 0 });
    act(() => result.current.play());
    advance(399);
    expect(result.current.playedCount).toBe(0);
    advance(2);
    expect(result.current.playedCount).toBe(1);
    // segment 2 appears after segment 1 has had time to be spoken (5 words / 2.5 wps = 2s)
    advance(segmentDurationMs(segs[0]!.text) - 10);
    expect(result.current.playedCount).toBe(1);
    advance(20);
    expect(result.current.playedCount).toBe(2);
  });

  it("finishes after the last segment", () => {
    const { result } = renderHook(() => usePlayer(segs, 1));
    act(() => result.current.play());
    advance(60_000);
    expect(result.current).toMatchObject({ status: "finished", playedCount: 3 });
  });

  it("plays faster at higher speed", () => {
    const slow = renderHook(() => usePlayer(segs, 1));
    const fast = renderHook(() => usePlayer(segs, 8));
    act(() => slow.result.current.play());
    act(() => fast.result.current.play());
    advance(2_000);
    expect(fast.result.current.playedCount).toBeGreaterThan(slow.result.current.playedCount);
    expect(fast.result.current.playedCount).toBe(3);
  });

  it("pauses without losing place, resumes, and skips to the end", () => {
    const { result } = renderHook(() => usePlayer(segs, 1));
    act(() => result.current.play());
    advance(500);
    act(() => result.current.pause());
    expect(result.current.status).toBe("paused");
    const at = result.current.playedCount;
    advance(30_000);
    expect(result.current.playedCount).toBe(at);
    act(() => result.current.resume());
    advance(60_000);
    expect(result.current.status).toBe("finished");

    act(() => result.current.reset());
    expect(result.current).toMatchObject({ status: "idle", playedCount: 0 });
    act(() => result.current.skipToEnd());
    expect(result.current).toMatchObject({ status: "finished", playedCount: 3 });
  });

  it("restarts from the top when play() is called again", () => {
    const { result } = renderHook(() => usePlayer(segs, 1));
    act(() => result.current.play());
    advance(60_000);
    act(() => result.current.play());
    expect(result.current).toMatchObject({ status: "playing", playedCount: 0 });
  });
});
