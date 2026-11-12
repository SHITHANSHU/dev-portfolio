import type { ComponentType } from "react";
import { RedisPersistenceExplorer } from "./RedisPersistenceExplorer";
import { RedisPubSubVsStreams } from "./RedisPubSubVsStreams";
import { RedisStreamGroupExplorer } from "./RedisStreamGroupExplorer";

export const redisLabs: Record<string, ComponentType> = {
  RedisPersistenceExplorer: RedisPersistenceExplorer,
  RedisPubSubVsStreams: RedisPubSubVsStreams,
  RedisStreamGroupExplorer: RedisStreamGroupExplorer,
};
