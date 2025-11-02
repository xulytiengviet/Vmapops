/**
 * Chat API Route
 * Connects chat with Mastra Agent
 */

import { mastra } from "@/mastra";

export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { messages } = body;

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

        // Generate response from agent - Mastra expects messages array directly
        const result = await agent.generate(formattedMessages);

        // Extract text from result
        let responseText = "";
        if (typeof result === "string") {
            responseText = result;
        } else if (result && typeof result === "object" && "text" in result) {
            responseText = (result as any).text;
        } else if (result && typeof result === "object" && "content" in result) {
            responseText = (result as any).content;
        } else {
            responseText = "I received your message.";
        }

        return Response.json({
            content: responseText,
            role: "assistant",
        });
    } catch (error) {
        console.error("Chat API error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return Response.json(
            { content: `Error: ${errorMessage}`, role: "assistant" },
            { status: 500 }
        );
    }
}
