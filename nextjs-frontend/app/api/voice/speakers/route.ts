/**
 * Voice Speakers API Route
 * Get available voices from ElevenLabs
 */

import { VoiceService } from "@/lib/services/voice-service";

export const maxDuration = 10;

export async function GET() {
  try {
    const voiceService = new VoiceService();
    const speakers = await voiceService.getSpeakers();

    return Response.json({
      success: true,
      speakers,
      defaultSpeaker: voiceService.getDefaultSpeaker(),
    });
  } catch (error) {
    console.error("[Voice Speakers API] Error:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch speakers",
      },
      { status: 500 }
    );
  }
}

