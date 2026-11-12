import type { ComponentType } from "react";
import { BandwidthStorageCalculator } from "./BandwidthStorageCalculator";
import { CameraConfigPlayground } from "./CameraConfigPlayground";
import { GopVisualizer } from "./GopVisualizer";
import { StreamTroubleshootingSimulator } from "./StreamTroubleshootingSimulator";
import { VideoPipelineExplorer } from "./VideoPipelineExplorer";

export const cameraLabs: Record<string, ComponentType> = {
  CameraConfigPlayground: CameraConfigPlayground,
  BandwidthStorageCalculator: BandwidthStorageCalculator,
  GopVisualizer: GopVisualizer,
  VideoPipelineExplorer: VideoPipelineExplorer,
  StreamTroubleshootingSimulator: StreamTroubleshootingSimulator,
};
