/**
 * Voice Service
 * Wraps ElevenLabs TTS and OpenAI Whisper STT
 * Provides unified interface for voice capabilities
 */

import { ElevenLabsVoice } from "@mastra/voice-elevenlabs";
import { OpenAIVoice } from "@mastra/voice-openai";
import OpenAI from "openai";

export interface VoiceConfig {
  elevenLabsApiKey?: string;
  openaiApiKey?: string;
  defaultSpeaker?: string;
}

export interface Speaker {
  voiceId: string;
  name: string;
  language?: string;
  gender?: string;
}

export class VoiceService {
  private elevenLabs: ElevenLabsVoice | null = null;
  private openai: OpenAI | null = null;
  private openaiVoice: OpenAIVoice | null = null;
  private defaultSpeaker: string;

  constructor(config?: VoiceConfig) {
    const elevenLabsKey = config?.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
    const openaiKey = config?.openaiApiKey || process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY is required for voice services");
    }

    console.log("[VoiceService] Initializing OpenAI Voice (primary TTS)");

    // Initialize OpenAI for both Whisper STT and TTS
    this.openai = new OpenAI({
      apiKey: openaiKey,
    });
    
    try {
      this.openaiVoice = new OpenAIVoice();
      console.log("[VoiceService] OpenAI Voice initialized successfully");
    } catch (e) {
      console.error("[VoiceService] Failed to initialize OpenAI Voice:", e);
      throw new Error("Failed to initialize OpenAI Voice - voice features unavailable");
    }

    // OpenAI TTS voices: alloy, echo, fable, onyx, nova, shimmer
    this.defaultSpeaker = config?.defaultSpeaker || "alloy";

    // Initialize ElevenLabs as fallback (optional)
    if (elevenLabsKey) {
      console.log("[VoiceService] ElevenLabs available as fallback");
      if (!process.env.ELEVENLABS_API_KEY && elevenLabsKey) {
        process.env.ELEVENLABS_API_KEY = elevenLabsKey;
      }
      try {
        this.elevenLabs = new ElevenLabsVoice({
          speechModel: {
            name: "eleven_multilingual_v2",
            apiKey: elevenLabsKey,
          },
          speaker: "9BWtsMINqrJLrRacOk9x",
        });
      } catch (e) {
        console.warn("[VoiceService] ElevenLabs fallback not available:", e);
        this.elevenLabs = null;
      }
    } else {
      console.log("[VoiceService] No ElevenLabs key - using OpenAI TTS only");
    }
  }

  /**
   * Convert text to speech using OpenAI TTS
   * Returns Node.js ReadableStream (can be piped directly to response)
   */
  async speak(text: string, speaker?: string): Promise<NodeJS.ReadableStream> {
    if (!this.openaiVoice) {
      throw new Error("OpenAI Voice not initialized");
    }

    try {
      // OpenAI TTS voices: alloy, echo, fable, onyx, nova, shimmer
      const voice = speaker || this.defaultSpeaker;
      console.log("[VoiceService] Using OpenAI TTS, voice:", voice, "text length:", text.length);
      
      const audioStream = await this.openaiVoice.speak(text, { 
        voice: voice as any,
        filetype: "mp3" 
      });

      if (!audioStream) {
        throw new Error("Failed to generate audio stream from OpenAI");
      }

      console.log("[VoiceService] OpenAI TTS stream generated successfully");
      return audioStream as unknown as NodeJS.ReadableStream;
    } catch (error: any) {
      console.error("[VoiceService] OpenAI TTS error:", error);
      
      // Fallback to ElevenLabs if available
      if (this.elevenLabs) {
        try {
          console.log("[VoiceService] Trying ElevenLabs fallback...");
          const voiceId = "9BWtsMINqrJLrRacOk9x"; // Default ElevenLabs voice
          const audioStream = await this.elevenLabs.speak(text, { speaker: voiceId });
          console.log("[VoiceService] ElevenLabs fallback succeeded");
          return audioStream;
        } catch (fallbackErr: any) {
          console.error("[VoiceService] ElevenLabs fallback error:", fallbackErr);
        }
      }
      
      throw new Error(`Voice synthesis failed: ${error.message || error}`);
    }
  }

  /**
   * Convert speech to text using OpenAI Whisper
   */
  async listen(audioFile: File | Blob): Promise<{ text: string; language?: string }> {
    if (!this.openai) {
      throw new Error("OpenAI API key not configured - STT unavailable");
    }

    try {
      // Convert File/Blob to a format OpenAI expects
      const formData = new FormData();
      formData.append("file", audioFile, "audio.webm");
      formData.append("model", "whisper-1");
      formData.append("language", "en"); // Optional: auto-detect if not specified

      const response = await this.openai.audio.transcriptions.create({
        file: audioFile as any,
        model: "whisper-1",
        language: "en", // Optional - can be auto-detected
      });

      return {
        text: response.text,
        language: (response as any).language, // Language may not be in type definition
      };
    } catch (error) {
      console.error("[VoiceService] Listen error:", error);
      throw error;
    }
  }

  /**
   * Get available speakers/voices
   * Returns OpenAI TTS voices
   */
  async getSpeakers(): Promise<Speaker[]> {
    // OpenAI TTS voices
    return [
      { voiceId: "alloy", name: "Alloy", gender: "neutral" },
      { voiceId: "echo", name: "Echo", gender: "male" },
      { voiceId: "fable", name: "Fable", gender: "neutral" },
      { voiceId: "onyx", name: "Onyx", gender: "male" },
      { voiceId: "nova", name: "Nova", gender: "female" },
      { voiceId: "shimmer", name: "Shimmer", gender: "female" },
    ];
  }

  /**
   * Get default speaker ID
   */
  getDefaultSpeaker(): string {
    return this.defaultSpeaker;
  }
}
