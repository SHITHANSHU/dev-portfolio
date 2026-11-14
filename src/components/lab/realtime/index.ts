import type { ComponentType } from "react";
import { RealtimeFanoutCalculator } from "./RealtimeFanoutCalculator";
import { ReconnectStormPlayground } from "./ReconnectStormPlayground";
import { SlowSubscriberExplorer } from "./SlowSubscriberExplorer";

export const realtimeLabs: Record<string, ComponentType> = {
  RealtimeFanoutCalculator: RealtimeFanoutCalculator,
  ReconnectStormPlayground: ReconnectStormPlayground,
  SlowSubscriberExplorer: SlowSubscriberExplorer,
};
