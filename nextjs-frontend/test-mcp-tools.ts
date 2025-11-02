/**
 * Test script to verify MCP tools are working
 * Run with: npx tsx test-mcp-tools.ts
 */

import { getMCPTools } from "./mastra/mcp/config";

async function testMCPTools() {
  console.log("🧪 Testing MCP Tools Integration\n");

  try {
    // Load MCP tools
    console.log("1️⃣ Loading MCP tools...");
    const tools = await getMCPTools();
    const toolNames = Object.keys(tools);
    console.log(`✅ Loaded ${toolNames.length} tools:`, toolNames);
    console.log("");

    // Test Tavily Search
    console.log("2️⃣ Testing tavily_tavily_search...");
    const tavilySearch = tools["tavily_tavily_search"];

    if (!tavilySearch) {
      console.error("❌ tavily_tavily_search tool not found!");
      return;
    }

    console.log("   Searching for: 'best coffee shops in San Francisco 2025'");
    const tavilyResult = await tavilySearch.execute({
      context: {
        query: "best coffee shops in San Francisco 2025",
        max_results: 3
      }
    });

    console.log("   Result:");
    console.log(JSON.stringify(tavilyResult, null, 2));
    console.log("");

    // Test Exa Search
    console.log("3️⃣ Testing exa_web_search_exa...");
    const exaSearch = tools["exa_web_search_exa"];

    if (!exaSearch) {
      console.error("❌ exa_web_search_exa tool not found!");
      return;
    }

    console.log("   Searching for: 'cozy coffee shops with good vibes'");
    const exaResult = await exaSearch.execute({
      context: {
        query: "cozy coffee shops with good vibes San Francisco",
        num_results: 3
      }
    });

    console.log("   Result:");
    console.log(JSON.stringify(exaResult, null, 2));
    console.log("");

    console.log("✅ All MCP tools tests passed!");

  } catch (error) {
    console.error("❌ Test failed with error:");
    console.error(error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Stack trace:", error.stack);
    }
  }
}

// Run the test
testMCPTools()
  .then(() => {
    console.log("\n✅ Test completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  });
