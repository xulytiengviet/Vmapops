/**
 * Voice Speak API Route
 * Text-to-Speech using ElevenLabs
 */

import { NextRequest } from "next/server";
import { VoiceService } from "@/lib/services/voice-service";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, speaker } = body;

    if (!text || typeof text !== "string") {
      return Response.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    if (text.length > 5000) {
      return Response.json(
        { error: "Text too long. Maximum length is 5000 characters." },
        { status: 400 }
      );
    }

    // Verify API key is available
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.error("[Voice Speak API] ELEVENLABS_API_KEY not found in environment");
      return Response.json(
        {
          success: false,
          error: "ELEVENLABS_API_KEY not configured",
        },
        { status: 500 }
      );
    }

    console.log("[Voice Speak API] Generating speech for text length:", text.length, "speaker:", speaker || "default");

    const voiceService = new VoiceService();
    const audioStream = await voiceService.speak(text, speaker);

    // Convert Node.js ReadableStream to Web ReadableStream
    const webStream = new ReadableStream({
      async start(controller) {
        try {
          // Handle Node.js stream
          if (audioStream && typeof (audioStream as any).pipe === 'function') {
            // Node.js ReadableStream - convert chunks
            for await (const chunk of audioStream as any) {
              controller.enqueue(new Uint8Array(chunk));
            }
          } else {
            // Already a Web ReadableStream
            const reader = (audioStream as any).getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          }
          controller.close();
        } catch (error) {
          console.error("[Voice Speak API] Stream error:", error);
          controller.error(error);
        }
      },
    });

    // Return audio stream
    return new Response(webStream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[Voice Speak API] Error:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate speech",
      },
      { status: 500 }
    );
  }
}

