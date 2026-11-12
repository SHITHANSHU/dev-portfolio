import { describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GopVisualizer } from "./GopVisualizer";
import { CameraConfigPlayground } from "./CameraConfigPlayground";
import { StreamTroubleshootingSimulator } from "./StreamTroubleshootingSimulator";

describe("camera labs", () => {
  it("GopVisualizer: dropping a frame shows loss; Reset clears", async () => {
    cleanup();
    const u = userEvent.setup();
    render(<GopVisualizer />);
    expect(screen.getAllByText(/No frames dropped/).length).toBeGreaterThan(0);
    await u.click(screen.getByRole("button", { name: /Frame 3,/ }));
    expect(screen.getAllByText(/unusable/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/No frames dropped/)).toHaveLength(0);
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getAllByText(/No frames dropped/).length).toBeGreaterThan(0);
  });
  it("CameraConfigPlayground: codec change alters output; Reset restores", async () => {
    cleanup();
    const u = userEvent.setup();
    render(<CameraConfigPlayground />);
    expect(screen.getAllByText(/4.00 Mbit\/s/).length).toBeGreaterThan(0);
    await u.click(screen.getByRole("button", { name: "4K" }));
    expect(screen.getAllByText(/4K at 25 fps/).length).toBeGreaterThan(0);
    await u.click(screen.getByRole("button", { name: "MJPEG" }));
    expect(screen.getAllByText(/MJPEG is intra-only/).length).toBeGreaterThan(0);
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.queryAllByText(/MJPEG is intra-only/)).toHaveLength(0);
  });
  it("StreamTroubleshootingSimulator: scenario switch", async () => {
    cleanup();
    const u = userEvent.setup();
    render(<StreamTroubleshootingSimulator />);
    await u.click(screen.getByRole("button", { name: "NAT / auth failure" }));
    expect(screen.getByLabelText("Synthetic log output").textContent).toContain("401");
  });
});
