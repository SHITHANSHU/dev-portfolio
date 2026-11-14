import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RealtimeFanoutCalculator } from "./RealtimeFanoutCalculator";
import { ReconnectStormPlayground } from "./ReconnectStormPlayground";
import { SlowSubscriberExplorer } from "./SlowSubscriberExplorer";

afterEach(cleanup);

const summaryText = () => document.querySelector("[aria-live]")?.textContent ?? "";

describe("RealtimeFanoutCalculator", () => {
  it("strategy and routing change the summary; Reset restores", async () => {
    const u = userEvent.setup();
    render(<RealtimeFanoutCalculator />);
    const first = summaryText();
    expect(first).toMatch(/per-room, pod-coalesced subscriptions under round-robin routing/);
    await u.click(screen.getByRole("button", { name: "global channel" }));
    expect(summaryText()).toMatch(/4,000,000 Redis deliveries\/s/);
    expect(summaryText()).toMatch(/discards 82%/);
    await u.click(screen.getByRole("button", { name: "room affinity" }));
    expect(summaryText()).not.toBe(first);
    await u.click(screen.getByRole("button", { name: "Publish sample" }));
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(summaryText()).toBe(first);
    expect(screen.getByRole("button", { name: "per-room, coalesced" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("ReconnectStormPlayground", () => {
  it("policy changes the summary, Step advances, Reset restores", async () => {
    const u = userEvent.setup();
    render(<ReconnectStormPlayground />);
    expect(summaryText()).toMatch(/Tick 1 of 40/);
    await u.click(screen.getByRole("button", { name: "Step" }));
    expect(summaryText()).toMatch(/Tick 2 of 40/);
    await u.click(screen.getByRole("button", { name: "Trigger event" }));
    for (let i = 0; i < 10; i++) await u.click(screen.getByRole("button", { name: "Step" }));
    const immediate = summaryText();
    expect(immediate).toMatch(/peak 20 attempts/);
    await u.click(screen.getByRole("button", { name: "backoff + jitter" }));
    expect(summaryText()).not.toBe(immediate);
    expect(summaryText()).toMatch(/full jitter/);
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(summaryText()).toMatch(/Tick 1 of 40/);
    expect(summaryText()).toMatch(/No event yet/);
    expect(screen.getByRole("button", { name: "immediate" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("SlowSubscriberExplorer", () => {
  it("write policy changes the summary, Step moves the playhead, Reset restores", async () => {
    const u = userEvent.setup();
    render(<SlowSubscriberExplorer />);
    const hol = summaryText();
    expect(hol).toMatch(/Playhead at t = 1 s/);
    expect(hol).toMatch(/closes the subscriber connection/);
    await u.click(screen.getByRole("button", { name: "Step" }));
    expect(summaryText()).toMatch(/Playhead at t = 2 s/);
    await u.click(screen.getByRole("button", { name: "drop oldest" }));
    expect(summaryText()).toMatch(/never reaches a limit/);
    expect(summaryText()).not.toBe(hol);
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(summaryText()).toMatch(/Playhead at t = 1 s/);
    expect(summaryText()).toMatch(/closes the subscriber connection/);
  });
});
