import type { ComponentType } from "react";
import { ShardSizingCalculator } from "./ShardSizingCalculator";
import { RoutingSkewPlayground } from "./RoutingSkewPlayground";
import { AliasReindexPlayground } from "./AliasReindexPlayground";

export const elasticsearchLabs: Record<string, ComponentType> = {
  ShardSizingCalculator,
  RoutingSkewPlayground,
  AliasReindexPlayground,
};
