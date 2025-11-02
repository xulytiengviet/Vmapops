/**
 * Voice Listen API Route
 * Speech-to-Text using OpenAI Whisper
 */

import { NextRequest } from "next/server";
import { VoiceService } from "@/lib/services/voice-service";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    console.log("[Voice Listen API] Received transcription request");
    
    // Check if OPENAI_API_KEY is available
    if (!process.env.OPENAI_API_KEY) {
      console.error("[Voice Listen API] OPENAI_API_KEY not found in environment!");
      return Response.json(
        { 
          success: false,
          error: "OPENAI_API_KEY not configured on server" 
        },
        { status: 500 }
      );
    }
    
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      console.warn("[Voice Listen API] No audio file in request");
      return Response.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    console.log("[Voice Listen API] Audio file received:", {
      name: audioFile.name,
      type: audioFile.type,
      size: audioFile.size,
    });

    // Validate file size (max 25MB for Whisper)
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (audioFile.size > maxSize) {
      console.warn("[Voice Listen API] File too large:", audioFile.size);
      return Response.json(
        { error: "Audio file too large. Maximum size is 25MB." },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ["audio/webm", "audio/mp3", "audio/wav", "audio/ogg", "audio/mpeg", "audio/m4a"];
    if (!validTypes.includes(audioFile.type)) {
      console.warn("[Voice Listen API] Invalid file type:", audioFile.type);
      return Response.json(
        { error: `Invalid file type. Supported types: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    console.log("[Voice Listen API] Initializing VoiceService...");
    const voiceService = new VoiceService();
    
    console.log("[Voice Listen API] Calling Whisper API...");
    const result = await voiceService.listen(audioFile);
    
    console.log("[Voice Listen API] Transcription successful:", {
      textLength: result.text?.length || 0,
      language: result.language,
      text: result.text?.substring(0, 50) + "...",
    });

    return Response.json({
      success: true,
      text: result.text,
      language: result.language,
    });
  } catch (error) {
    console.error("[Voice Listen API] Error:", error);
    console.error("[Voice Listen API] Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to transcribe audio",
      },
      { status: 500 }
    );
  }
}
