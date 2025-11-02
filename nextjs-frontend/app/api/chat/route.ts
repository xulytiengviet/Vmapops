/**
 * AI SDK Chat Route using Mastra's native AI SDK integration
 * Following Mastra documentation for AI SDK support
 */

import { mastra } from "@/mastra";
import { RuntimeContext } from "@mastra/core/runtime-context";

export const maxDuration = 60;

export type ChatRuntimeContext = {
    userLocation?: { lat: number; lng: number };
    mapCenter?: { lat: number; lng: number };
    mapZoom?: number;
};

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { messages, context } = body;

        // Debug: Log what we received
        console.log("[AI SDK Route] Received request with context:", JSON.stringify(context, null, 2));
        console.log("[AI SDK Route] Number of messages:", messages?.length);

        // Validate messages
        if (!messages || !Array.isArray(messages)) {
            return Response.json(
                { error: "Messages array is required" },
                { status: 400 }
            );
        }

        // Get the agent
        const agent = mastra.getAgent("cityAnalystAgent");
        if (!agent) {
            return Response.json(
                { error: "Agent not found" },
                { status: 500 }
            );
        }

        // Create RuntimeContext with user location and map state
        const runtimeContext = new RuntimeContext<ChatRuntimeContext>();
        
        if (context?.userLocation) {
            runtimeContext.set("userLocation", context.userLocation);
            console.log("✅ [AI SDK Route] User location SET in RuntimeContext:", context.userLocation);
        } else {
            console.warn("⚠️ [AI SDK Route] No userLocation in context - tools will not have location fallback!");
        }
        
        if (context?.mapCenter) {
            runtimeContext.set("mapCenter", context.mapCenter);
            console.log("✅ [AI SDK Route] Map center SET in RuntimeContext:", context.mapCenter);
        }
        
        if (context?.mapZoom) {
            runtimeContext.set("mapZoom", context.mapZoom);
            console.log("✅ [AI SDK Route] Map zoom SET in RuntimeContext:", context.mapZoom);
        }

        // Stream the agent response in AI SDK format
        const stream = await agent.stream(messages, {
            runtimeContext,
            format: "aisdk",  // Use Mastra's built-in AI SDK format
            maxSteps: 10,     // Allow up to 10 tool calls
            onStepFinish: (step: any) => {
                console.log("[AI SDK Route] Step finished:", step);

                // Log mapCommands if present in tool results
                if (step?.toolResults) {
                    for (const toolResult of step.toolResults) {
                        if (toolResult?.result?.data?.mapCommands) {
                            console.log(`[AI SDK Route] mapCommands from ${toolResult.toolName}:`,
                                toolResult.result.data.mapCommands);
                        }
                    }
                }
            }
        });

        // Return the stream as UI Message Stream Response
        // Mastra handles the conversion to AI SDK format internally
        return stream.toUIMessageStreamResponse();

    } catch (error) {
        console.error("[AI SDK Route] Error:", error);
        return Response.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
