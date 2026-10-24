import { describe, expect, it } from "vitest";
import { isOverTarget, talkRatioTone, timerProgress } from "@/lib/talk-timer";

describe("talk timer", () => {
  it("warns only once the target is exceeded", () => {
    expect(isOverTarget(29_999, 30)).toBe(false);
    expect(isOverTarget(30_000, 30)).toBe(false);
    expect(isOverTarget(30_001, 30)).toBe(true);
    expect(isOverTarget(21_000, 20)).toBe(true);
    expect(isOverTarget(59_000, 60)).toBe(false);
  });

  it("caps progress at 100%", () => {
    expect(timerProgress(15_000, 30)).toBe(0.5);
    expect(timerProgress(90_000, 30)).toBe(1);
  });

  it("rates the consultant's share of the conversation", () => {
    expect(talkRatioTone(40)).toBe("good");
    expect(talkRatioTone(41)).toBe("watch");
    expect(talkRatioTone(56)).toBe("high");
  });
});
