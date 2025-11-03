/**
 * Mastra Configuration
 * Initializes agents and tools for the MapOps assistant
 * 
 * Note: Using manual Next.js API routes instead of Mastra's built-in server
 * since we're embedding Mastra in a Next.js app rather than running it as
 * a separate server.
 */

import { Mastra } from "@mastra/core";
import { getCityAnalystAgent } from "./agents/cityAnalystAgent";

let mastraInstance: Mastra | null = null;
let mastraPromise: Promise<Mastra> | null = null;

/**
 * Get the initialized Mastra instance (lazy async initialization)
 */
export async function getMastra(): Promise<Mastra> {
    if (mastraInstance) {
        return mastraInstance;
    }
    
    if (!mastraPromise) {
        mastraPromise = (async () => {
            const agent = await getCityAnalystAgent();
            const mastra = new Mastra({
                agents: { cityAnalystAgent: agent },
            });
            mastraInstance = mastra;
            return mastra;
        })();
    }
    
    return mastraPromise;
}

/**
 * Synchronous getter - throws if Mastra is not yet initialized
 * Use getMastra() instead for async initialization
 */
export const mastra = new Proxy({} as Mastra, {
    get(_target, prop) {
        if (mastraInstance) {
            return (mastraInstance as any)[prop];
        }
        throw new Error(
            `Mastra is not initialized yet. Use getMastra() to initialize it first. ` +
            `Called: mastra.${String(prop)}`
        );
    },
});
