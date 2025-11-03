/**
 * MCP (Model Context Protocol) Configuration
 * Connects to Tavily and Exa remote MCP servers for enhanced search capabilities
 */

import { MCPClient } from "@mastra/mcp";

/**
 * Global cache for MCP client to prevent re-initialization in development mode
 */
declare global {
  var __mcpClient: MCPClient | undefined;
}

/**
 * Unified MCP Client
 * Connects to both Tavily and Exa remote MCP servers
 */
export const mcpClient = global.__mcpClient ?? new MCPClient({
  id: "mapops-mcp-client", // Unique ID to prevent multiple initialization errors
  servers: {
    tavily: {
      url: new URL(
        `https://mcp.tavily.com/mcp/?tavilyApiKey=${process.env.TAVILY_API_KEY || ""}`
      ),
    },
    exa: {
      url: new URL(
        `https://mcp.exa.ai/mcp?exaApiKey=${process.env.EXA_API_KEY || ""}`
      ),
    },
  },
});

// Cache the client globally to prevent re-initialization
if (process.env.NODE_ENV !== "production") {
  global.__mcpClient = mcpClient;
}

/**
 * Get all tools from connected MCP servers
 * This is called during agent initialization to auto-load MCP tools
 */
export const getMCPTools = async () => {
  try {
    console.log("[MCP] Loading tools from Tavily and Exa servers...");

    // Auto-load all tools from both servers
    const tools = await mcpClient.getTools();

    // Log available tools for debugging
    const toolNames = Object.keys(tools);
    console.log(`[MCP] Loaded ${toolNames.length} tools:`, toolNames);

    return tools;
  } catch (error) {
    console.error("[MCP] Failed to load MCP tools:", error);
    console.error("[MCP] Error details:", error instanceof Error ? error.message : String(error));

    // Return empty object if loading fails (non-blocking)
    return {};
  }
};

/**
 * Cleanup MCP client connection
 * Call this when shutting down the application
 */
export const cleanupMCPClient = async () => {
  try {
    await mcpClient.disconnect();
    console.log("[MCP] Disconnected from MCP servers");
  } catch (error) {
    console.error("[MCP] Error during cleanup:", error);
  }
};
