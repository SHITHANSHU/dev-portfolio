import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IotPipelineSimulator } from "./IotPipelineSimulator";
import { StreamWindowExplorer } from "./StreamWindowExplorer";
import { MqttQosPlayground } from "./MqttQosPlayground";

afterEach(cleanup);

describe("IotPipelineSimulator", () => {
  it("Step advances ticks; Reset returns to tick 0", async () => {
    const u = userEvent.setup();
    render(<IotPipelineSimulator />);
    expect(screen.getByText(/Tick 0:/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByText(/Tick 1:/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(/Tick 0:/)).toBeTruthy();
  });
});

describe("StreamWindowExplorer", () => {
  it("arrival change updates summary; Reset restores", async () => {
    const u = userEvent.setup();
    render(<StreamWindowExplorer />);
    expect(screen.getByText(/\(in-order\)/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Some very late" }));
    expect(screen.getByText(/\(late\)/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(/\(in-order\)/)).toBeTruthy();
  });
});

describe("MqttQosPlayground", () => {
  it("QoS change updates effective QoS; Reset restores", async () => {
    const u = userEvent.setup();
    render(<MqttQosPlayground />);
    await u.click(screen.getAllByRole("button", { name: "QoS 0" })[0] as HTMLElement);
    expect(screen.getByText(/Effective QoS is 0/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(/Effective QoS is 1/)).toBeTruthy();
  });
});
