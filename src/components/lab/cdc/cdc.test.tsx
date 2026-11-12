import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CdcCapacityCalculator } from "./CdcCapacityCalculator";
import { IndexingBacklogSimulator } from "./IndexingBacklogSimulator";
import { CdcArchitectureExplorer } from "./CdcArchitectureExplorer";

afterEach(cleanup);

describe("CdcCapacityCalculator", () => {
  it("changes output on input and Reset restores", async () => {
    const u = userEvent.setup();
    render(<CdcCapacityCalculator />);
    const rps = screen.getByLabelText(/App requests/);
    expect((rps as HTMLInputElement).value).toBe("1000");
    expect(screen.getByText(/1,000 requests\/s produce 240 CDC/)).toBeTruthy();
    await u.clear(rps);
    await u.type(rps, "5000");
    expect(screen.getByText(/5,000 requests\/s produce 1,200 CDC/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect((screen.getByLabelText(/App requests/) as HTMLInputElement).value).toBe("1000");
  });
});

describe("IndexingBacklogSimulator", () => {
  it("scenario change updates summary; Reset restores", async () => {
    const u = userEvent.setup();
    render(<IndexingBacklogSimulator />);
    await u.click(screen.getByRole("button", { name: "Steady" }));
    expect(screen.getByText(/Peak backlog 0 docs/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("button", { name: /Consumer outage/ }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("CdcArchitectureExplorer", () => {
  it("Step advances and Reset returns", async () => {
    const u = userEvent.setup();
    render(<CdcArchitectureExplorer />);
    await u.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByText(/step 2 of 5/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(/step 1 of 5/)).toBeTruthy();
  });
});
