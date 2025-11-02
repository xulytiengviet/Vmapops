/**
 * Streaming Chat API Route
 * Provides real-time streaming responses with tool execution progress
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

        // Map messages to the format expected by Mastra
        const formattedMessages = messages.map((m: any) => ({
            role: m.role,
            content: m.content,
        }));

        // Create RuntimeContext with user location and map state
        const runtimeContext = new RuntimeContext<ChatRuntimeContext>();
        if (context?.userLocation) {
            runtimeContext.set("userLocation", context.userLocation);
            console.log("[Stream API] User location from frontend:", context.userLocation);
        }
        if (context?.mapCenter) {
            runtimeContext.set("mapCenter", context.mapCenter);
        }
        if (context?.mapZoom) {
            runtimeContext.set("mapZoom", context.mapZoom);
        }

        // Create a streaming response
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // For now, fall back to generate() until streaming is properly configured
                    // Streaming requires additional Mastra configuration
                    console.log("[Stream API] Using generate() method with simulated streaming");

                    // Send initial status
                    controller.enqueue(encoder.encode(
                        `data: ${JSON.stringify({
                            type: 'status',
                            message: '🔍 Processing your request...'
                        })}\n\n`
                    ));

                    // Call generate() instead of stream()
                    const result = await agent.generate(formattedMessages, {
                        maxSteps: 10,
                        runtimeContext,
                    });

                    console.log("[Stream API] Agent result type:", typeof result);
                    console.log("[Stream API] Agent result keys:", result ? Object.keys(result) : "null");

                    let responseText = "";
                    let mapCommands: any[] = [];

                    // Extract text from result
                    if (typeof result === "string") {
                        responseText = result;
                    } else if (result && typeof result === "object") {
                        if ("text" in result) {
                            responseText = (result as any).text;
                        } else if ("content" in result) {
                            responseText = (result as any).content;
                        } else if ("message" in result) {
                            responseText = (result as any).message;
                        }

                        // Extract mapCommands from toolResults
                        if ("toolResults" in result && Array.isArray((result as any).toolResults)) {
                            const toolResults = (result as any).toolResults;
                            for (const toolResult of toolResults) {
                                // Send tool notification
                                controller.enqueue(encoder.encode(
                                    `data: ${JSON.stringify({
                                        type: 'tool-call',
                                        toolName: toolResult.toolName,
                                        message: `🔧 Used ${toolResult.toolName}`
                                    })}\n\n`
                                ));

                                if (toolResult.result?.data?.mapCommands && Array.isArray(toolResult.result.data.mapCommands)) {
                                    mapCommands.push(...toolResult.result.data.mapCommands);
                                    console.log(`[Stream API] Extracted ${toolResult.result.data.mapCommands.length} mapCommands from ${toolResult.toolName}`);
                                }
                            }
                        }
                    }

                    // Simulate streaming by sending text in chunks
                    if (responseText) {
                        const words = responseText.split(' ');
                        let currentText = '';

                        for (let i = 0; i < words.length; i++) {
                            currentText += (i > 0 ? ' ' : '') + words[i];

                            // Send text delta every few words for streaming effect
                            if (i % 3 === 0 || i === words.length - 1) {
                                const delta = words.slice(Math.max(0, i - 2), i + 1).join(' ');
                                controller.enqueue(encoder.encode(
                                    `data: ${JSON.stringify({
                                        type: 'text-delta',
                                        content: delta + ' '
                                    })}\n\n`
                                ));
                                // Small delay for streaming effect
                                await new Promise(resolve => setTimeout(resolve, 50));
                            }
                        }
                    }

                    // Send final message with mapCommands
                    controller.enqueue(encoder.encode(
                        `data: ${JSON.stringify({
                            type: 'finish',
                            content: responseText,
                            mapCommands: mapCommands
                        })}\n\n`
                    ));

                    // Close the stream
                    controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    controller.close();
                } catch (error) {
                    console.error("[Stream API] Error:", error);
                    controller.enqueue(encoder.encode(
                        `data: ${JSON.stringify({
                            type: 'error',
                            message: error instanceof Error ? error.message : 'Unknown error'
                        })}\n\n`
                    ));
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error("Stream API error:", error);
        return Response.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}