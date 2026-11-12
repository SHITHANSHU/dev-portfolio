import type { ComponentType } from "react";
import { IotPipelineSimulator } from "./IotPipelineSimulator";
import { MqttQosPlayground } from "./MqttQosPlayground";
import { IotPartitioningExplorer } from "./IotPartitioningExplorer";
import { StreamWindowExplorer } from "./StreamWindowExplorer";
import { MongoDataExplorer } from "./MongoDataExplorer";

export const iotLabs: Record<string, ComponentType> = {
  IotPipelineSimulator: IotPipelineSimulator,
  MqttQosPlayground: MqttQosPlayground,
  IotPartitioningExplorer: IotPartitioningExplorer,
  StreamWindowExplorer: StreamWindowExplorer,
  MongoDataExplorer: MongoDataExplorer,
};
