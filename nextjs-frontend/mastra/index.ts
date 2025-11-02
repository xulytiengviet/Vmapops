/**
 * Mastra Configuration
 * Initializes agents and tools for the MapOps assistant
 * 
 * Note: Using manual Next.js API routes instead of Mastra's built-in server
 * since we're embedding Mastra in a Next.js app rather than running it as
 * a separate server.
 */

import { Mastra } from "@mastra/core";
import { cityAnalystAgent } from "./agents/cityAnalystAgent";

export const mastra = new Mastra({
    agents: { cityAnalystAgent },
});
