import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShardSizingCalculator } from "./ShardSizingCalculator";
import { RoutingSkewPlayground } from "./RoutingSkewPlayground";
import { AliasReindexPlayground } from "./AliasReindexPlayground";
import { elasticsearchLabs } from "./index";
import { labComponents } from "../registry";

afterEach(cleanup);

describe("registry", () => {
  it("exposes the three Elasticsearch labs", () => {
    for (const k of Object.keys(elasticsearchLabs)) expect(labComponents[k]).toBe(elasticsearchLabs[k]);
    expect(Object.keys(elasticsearchLabs)).toEqual(["ShardSizingCalculator", "RoutingSkewPlayground", "AliasReindexPlayground"]);
  });
});

describe("ShardSizingCalculator", () => {
  it("shows the worked example, changes on input and Reset restores", async () => {
    const u = userEvent.setup();
    render(<ShardSizingCalculator />);
    expect(screen.getByText(/25 indices retained, 300 shards in total/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Daily indices" }));
    expect(screen.getByText(/Daily indices: 30 indices retained/)).toBeTruthy();
    expect(screen.getByText(/First limit hit: (no limit hit|shards too)/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(/25 indices retained, 300 shards in total/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rollover by size" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("flags disk pressure when nodes shrink", () => {
    render(<ShardSizingCalculator />);
    const nodes = screen.getByLabelText(/Data nodes/);
    fireEvent.change(nodes, { target: { value: "5" } });
    expect(screen.getByText(/Disk is 120% full/)).toBeTruthy();
  });
});

describe("RoutingSkewPlayground", () => {
  it("Step advances, mode change updates the summary, Reset restores", async () => {
    const u = userEvent.setup();
    render(<RoutingSkewPlayground />);
    expect(screen.getByText(/Tick 0 of 40/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Step" }));
    await u.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByText(/Tick 2 of 40/)).toBeTruthy();
    expect(screen.getByText(/^t2 · 24 docs/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "_id (default)" }));
    expect(screen.getByText(/Default routing hashes the document id/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(/Tick 0 of 40/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "tenant_id" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("Play toggles to Pause and never autostarts", async () => {
    const u = userEvent.setup();
    render(<RoutingSkewPlayground />);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Pause" }));
  });
});

describe("AliasReindexPlayground", () => {
  it("Step advances through the copy, strategy changes the outcome, Reset restores", async () => {
    const u = userEvent.setup();
    render(<AliasReindexPlayground />);
    expect(screen.getByText(/Tick 0 of 30/)).toBeTruthy();
    for (let i = 0; i < 7; i++) await u.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByText(/The alias moved to v2 at tick 7. 70 writes are missing from v2 and 14 deleted/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Replay change log (CDC)" }));
    expect(screen.getByText(/Snapshot copied; 70 writes still need to reach v2/)).toBeTruthy();
    for (let i = 0; i < 2; i++) await u.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByText(/The alias moved to v2 at tick 9. 0 writes are missing from v2 and 0 deleted documents/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(/Tick 0 of 30/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Swap right after copy" }).getAttribute("aria-pressed")).toBe("true");
  });
});
