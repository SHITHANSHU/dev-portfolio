import type { ComponentType } from "react";
import { CdcArchitectureExplorer } from "./CdcArchitectureExplorer";
import { KafkaPartitionExplorer } from "./KafkaPartitionExplorer";
import { CdcCapacityCalculator } from "./CdcCapacityCalculator";
import { IndexingBacklogSimulator } from "./IndexingBacklogSimulator";

export const cdcLabs: Record<string, ComponentType> = {
  CdcArchitectureExplorer: CdcArchitectureExplorer,
  KafkaPartitionExplorer: KafkaPartitionExplorer,
  CdcCapacityCalculator: CdcCapacityCalculator,
  IndexingBacklogSimulator: IndexingBacklogSimulator,
};
