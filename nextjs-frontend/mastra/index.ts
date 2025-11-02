/**
 * Mastra Configuration
 * Initializes agents and tools for the MapOps assistant
 */

import { Mastra } from "@mastra/core";
import { cityAnalystAgent } from "./agents/cityAnalystAgent";

export const mastra = new Mastra({
    agents: { cityAnalystAgent },
});
