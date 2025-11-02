/**
 * Chat API Route
 * Connects chat with Mastra Agent
 * Uses RuntimeContext to pass user location to agent and tools
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
            console.error("Invalid messages format:", { body, messages });
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
            console.log("[Chat API] User location from frontend:", context.userLocation);
        }
        if (context?.mapCenter) {
            runtimeContext.set("mapCenter", context.mapCenter);
        }
        if (context?.mapZoom) {
            runtimeContext.set("mapZoom", context.mapZoom);
        }

        // Generate response from agent with tool support and runtime context
        const result = await agent.generate(formattedMessages, {
            maxSteps: 10, // Allow up to 10 tool calls per request
            runtimeContext,
        });

        // Extract text and map commands from result
        let responseText = "";
        let mapCommands: any[] = [];

        if (typeof result === "string") {
            responseText = result;
        } else if (result && typeof result === "object") {
            // Check various possible text fields
            if ("text" in result) {
                responseText = (result as any).text;
            } else if ("content" in result) {
                responseText = (result as any).content;
            } else if ("message" in result) {
                responseText = (result as any).message;
            } else {
                responseText = "I received your message.";
            }

            // Extract map commands if present
            if ("mapCommands" in result && Array.isArray((result as any).mapCommands)) {
                mapCommands = (result as any).mapCommands;
            }
        } else {
            responseText = "I received your message.";
        }

        return Response.json({
            content: responseText,
            role: "assistant",
            mapCommands: mapCommands,
        });
    } catch (error) {
        console.error("Chat API error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return Response.json(
            {
                content: `Error: ${errorMessage}`,
                role: "assistant",
                mapCommands: [],
            },
            { status: 500 }
        );
    }
}
