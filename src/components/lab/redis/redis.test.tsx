import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RedisPersistenceExplorer } from "./RedisPersistenceExplorer";
import { RedisPubSubVsStreams } from "./RedisPubSubVsStreams";
import { RedisStreamGroupExplorer } from "./RedisStreamGroupExplorer";

afterEach(cleanup);

describe("RedisPersistenceExplorer", () => {
  it("fsync change updates summary; Reset restores", async () => {
    const u = userEvent.setup();
    render(<RedisPersistenceExplorer />);
    expect(screen.getByText(/AOF appendfsync everysec at 1,000 writes\/s/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "always" }));
    expect(screen.getByText(/AOF appendfsync always at 1,000 writes\/s.*0 lost/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "RDB" }));
    expect(screen.getByText(/RDB snapshots only/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("button", { name: "everysec" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("RedisPubSubVsStreams", () => {
  it("crash toggle shows redelivery; Step advances; Reset restores", async () => {
    const u = userEvent.setup();
    render(<RedisPubSubVsStreams />);
    expect(screen.getByText(/Tick 1 of/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByText(/Tick 2 of/)).toBeTruthy();
    await u.click(screen.getByLabelText(/crashes before XACK/));
    await u.click(screen.getByRole("button", { name: "Rewind" }));
    for (let i = 0; i < 30; i++) await u.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getAllByText(/XAUTOCLAIM/).length).toBeGreaterThan(0);
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect((screen.getByLabelText(/crashes before XACK/) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/Tick 1 of/)).toBeTruthy();
  });
});

describe("RedisStreamGroupExplorer", () => {
  it("trim mode changes retention; Reset restores", async () => {
    const u = userEvent.setup();
    render(<RedisStreamGroupExplorer />);
    expect(screen.getByText(/200 kept after approximate MAXLEN ~/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "MAXLEN" }));
    expect(screen.getByText(/150 kept after exact MAXLEN/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(/200 kept after approximate/)).toBeTruthy();
  });
});
