/**
 * AI SDK Chat Route using Mastra's native AI SDK integration
 * Following Mastra documentation for AI SDK support
 * Using AI SDK v5's createUIMessageStream for proper data streaming
 */

import { getMastra } from "@/mastra";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

export const maxDuration = 60;

export type ChatRuntimeContext = {
    userLocation?: { lat: number; lng: number };
    mapCenter?: { lat: number; lng: number };
    mapZoom?: number;
    mapBounds?: { north: number; south: number; east: number; west: number };
    savedPlaces?: Record<string, { location: { lat: number; lng: number }; name: string; address: string }>;
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

        // Get the Mastra instance and agent
        const mastra = await getMastra();
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

        if (context?.mapBounds) {
            runtimeContext.set("mapBounds", context.mapBounds);
            console.log("✅ [AI SDK Route] Map bounds SET in RuntimeContext:", context.mapBounds);
        }

        if (context?.savedPlaces) {
            runtimeContext.set("savedPlaces", context.savedPlaces);
            console.log("✅ [AI SDK Route] Saved places SET in RuntimeContext:", Object.keys(context.savedPlaces));
        }

        // Use AI SDK v5's createUIMessageStream to properly inject data parts
        const uiStream = createUIMessageStream({
            async execute({ writer }) {
                // Get Mastra's agent stream
                const mastraStream = await agent.stream(messages, {
            runtimeContext,
            format: "aisdk",  // Use Mastra's built-in AI SDK format
            maxSteps: 10,     // Allow up to 10 tool calls
            onStepFinish: (step: any) => {
                console.log("[AI SDK Route] Step finished:", {
                    stepType: step.stepType,
                    toolCalls: step.toolCalls?.length || 0,
                    toolResults: step.toolResults?.length || 0,
                    textLength: step.text?.length || 0,
                    model: step.model?.modelId,
                });

                        // Extract mapCommands from step.content (where tool results actually are)
                        const content = step.content || [];
                        
                        // Log tool calls for debugging
                        if (step.toolCalls && step.toolCalls.length > 0) {
                            console.log(`[AI SDK Route] 🔧 Agent called ${step.toolCalls.length} tool(s):`, 
                                step.toolCalls.map((tc: any) => tc.toolName || tc.name || 'unknown'));
                        }
                        
                        for (const item of content) {
                            if (item.type === 'tool-result') {
                                const toolName = item.toolName || 'unknown';
                                // Mastra wraps outputs in { type: '...', value: {...} } format
                                const output = item.output || item.result || {};
                                const actualOutput = output.value || output; // Handle wrapped format
                                
                                console.log(`[AI SDK Route] Checking tool-result from ${toolName}:`, {
                                    hasOutput: !!output,
                                    outputKeys: output ? Object.keys(output) : [],
                                    hasValue: !!output.value,
                                    valueKeys: output.value ? Object.keys(output.value) : [],
                                    hasData: !!actualOutput?.data,
                                    dataKeys: actualOutput?.data ? Object.keys(actualOutput.data) : [],
                                    hasMapCommands: !!actualOutput?.data?.mapCommands,
                                });
                                
                                if (actualOutput?.data?.mapCommands) {
                                    const commandTypes = actualOutput.data.mapCommands.map((cmd: any) => cmd.type);
                                    console.log(`[AI SDK Route] ✅ Found ${actualOutput.data.mapCommands.length} mapCommands from ${toolName}:`, commandTypes);
                                    console.log(`[AI SDK Route] Full commands:`, JSON.stringify(actualOutput.data.mapCommands, null, 2));
                                    
                                    // Write mapCommands as data part using AI SDK v5 way
                                    writer.write({
                                        type: 'data-mapCommands',
                                        data: actualOutput.data.mapCommands,
                                    });
                                    console.log(`[AI SDK Route] ✅ Wrote mapCommands as data part:`, commandTypes.join(', '));
                                } else {
                                    // Log full structure for debugging
                                    console.log(`[AI SDK Route] ❌ No mapCommands found in ${toolName} output structure:`,
                                        JSON.stringify(output, null, 2));
                        }
                    }
                }
            }
        });

                // Merge Mastra's stream into our UI stream
                writer.merge(mastraStream.toUIMessageStream());
            },
            onError: (error) => {
                console.error("[AI SDK Route] Stream error:", error);
                return error instanceof Error ? error.message : "Unknown error";
            },
        });

        // Return the UI stream response
        return createUIMessageStreamResponse({
            stream: uiStream,
        });

    } catch (error) {
        console.error("[AI SDK Route] Error:", error);
        return Response.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
