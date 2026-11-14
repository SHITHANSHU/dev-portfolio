import type { ComponentType } from "react";
import { cdcLabs } from "./cdc";
import { cameraLabs } from "./camera";
import { iotLabs } from "./iot";
import { redisLabs } from "./redis";
import { rabbitmqLabs } from "./rabbitmq";
import { kafkaLabs } from "./kafka";
import { realtimeLabs } from "./realtime";

/**
 * Explicit registry of interactive labs available inside MDX.
 * Every lab is a self-contained client component with no required props.
 * To add one: create the component, export it from its group index, spread the group here.
 */
export const labComponents: Record<string, ComponentType> = { ...cdcLabs, ...iotLabs, ...cameraLabs, ...redisLabs, ...rabbitmqLabs, ...kafkaLabs, ...realtimeLabs };
