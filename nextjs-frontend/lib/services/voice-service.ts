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
  private elevenLabs: ElevenLabsVoice;
  private openai: OpenAI | null = null;
  private openaiVoice: OpenAIVoice | null = null;
  private defaultSpeaker: string;
  private apiKey: string;

  constructor(config?: VoiceConfig) {
    const elevenLabsKey = config?.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
    const openaiKey = config?.openaiApiKey || process.env.OPENAI_API_KEY;

    if (!elevenLabsKey) {
      throw new Error("ELEVENLABS_API_KEY is required");
    }

    console.log("[VoiceService] Initializing ElevenLabsVoice with API key:", elevenLabsKey ? `${elevenLabsKey.substring(0, 10)}...` : "missing");

    // Ensure env var is set for Mastra's internal validation
    // Mastra's ElevenLabsVoice checks process.env.ELEVENLABS_API_KEY even if apiKey is passed
    if (!process.env.ELEVENLABS_API_KEY && elevenLabsKey) {
      process.env.ELEVENLABS_API_KEY = elevenLabsKey;
    }

    // Initialize ElevenLabs TTS
    // Mastra's ElevenLabsVoice expects apiKey in speechModel.config
    // According to type definition: speechModel?: { name?: string, apiKey?: string }
    this.elevenLabs = new ElevenLabsVoice({
      speechModel: {
        name: "eleven_multilingual_v2",
        apiKey: elevenLabsKey,
      },
      speaker: config?.defaultSpeaker || "9BWtsMINqrJLrRacOk9x", // Default: Aria
    });

    this.defaultSpeaker = config?.defaultSpeaker || "9BWtsMINqrJLrRacOk9x";
    this.apiKey = elevenLabsKey;

    // Initialize OpenAI for Whisper STT and as TTS fallback
    if (openaiKey) {
      this.openai = new OpenAI({
        apiKey: openaiKey,
      });
      try {
        this.openaiVoice = new OpenAIVoice();
      } catch (e) {
        console.warn("[VoiceService] Failed to initialize OpenAI Voice fallback:", e);
        this.openaiVoice = null;
      }
    } else {
      console.warn("[VoiceService] OPENAI_API_KEY not set - STT will not be available");
    }
  }

  /**
   * Convert text to speech
   * Returns Node.js ReadableStream (can be piped directly to response)
   */
  async speak(text: string, speaker?: string): Promise<NodeJS.ReadableStream> {
    try {
      const voiceId = speaker || this.defaultSpeaker;
      console.log("[VoiceService] Speaking text (length:", text.length, "), voice:", voiceId);
      console.log("[VoiceService] ElevenLabs instance:", !!this.elevenLabs);
      
      // Ensure we have a valid speaker
      if (!voiceId) {
        throw new Error("No speaker/voice ID specified");
      }
      
      const audioStream = await this.elevenLabs.speak(text, {
        speaker: voiceId,
      });

      if (!audioStream) {
        throw new Error("Failed to generate audio stream - returned null/undefined");
      }

      console.log("[VoiceService] Audio stream generated successfully, type:", typeof audioStream);
      return audioStream;
    } catch (error: any) {
      console.error("[VoiceService] Speak error details:", {
        message: error.message,
        statusCode: error.statusCode,
        status: error.status,
        body: error.body,
        stack: error.stack?.substring(0, 500),
      });
      
      // Fallback #1: call ElevenLabs REST API directly
      try {
        const voiceId = speaker || this.defaultSpeaker;
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}` as any, {
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json",
          } as any,
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            // You can pass voice_settings here if needed
          }),
        } as any);

        if (!res.ok || !res.body) {
          const bodyText = await (res as any).text?.().catch(() => "");
          throw new Error(`HTTP fallback failed: ${res.status} ${res.statusText} ${bodyText || ""}`);
        }

        console.log("[VoiceService] Fallback REST call succeeded");
        // Return the web ReadableStream; route handler supports both Node and Web streams
        return (res as any).body as unknown as NodeJS.ReadableStream;
      } catch (fallbackErr: any) {
        console.error("[VoiceService] Fallback REST error:", fallbackErr);
        // Fallback #2: OpenAI TTS (if available)
        if (this.openaiVoice) {
          try {
            console.log("[VoiceService] Trying OpenAI TTS fallback...");
            const oaStream = await this.openaiVoice.speak(text, { filetype: "mp3" });
            return oaStream as unknown as NodeJS.ReadableStream;
          } catch (oaErr: any) {
            console.error("[VoiceService] OpenAI TTS fallback error:", oaErr);
          }
        }
        // Provide more detailed error information
        if (error.statusCode === 401 || error.status === 401) {
          throw new Error("ElevenLabs API key is invalid or expired. Please check your ELEVENLABS_API_KEY.");
        } else if (error.statusCode === 429 || error.status === 429) {
          throw new Error("ElevenLabs API quota exceeded. Please check your subscription.");
        } else if (error.message) {
          throw new Error(`ElevenLabs TTS error: ${error.message}`);
        }
        throw error;
      }
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
   * Note: ElevenLabsVoice may not expose getSpeakers, so we return default voices
   */
  async getSpeakers(): Promise<Speaker[]> {
    // Default ElevenLabs voices - common ones
    return [
      { voiceId: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", gender: "female" },
      { voiceId: "AZnzlk1XvdvUeBnXmlld", name: "Domi", gender: "female" },
      { voiceId: "EXAVITQu4vr4xnSDxMaL", name: "Bella", gender: "female" },
      { voiceId: "ErXwobaYiN019PkySvjV", name: "Antoni", gender: "male" },
      { voiceId: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", gender: "female" },
      { voiceId: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", gender: "male" },
      { voiceId: "VR6AewLTigWG4xSOukaG", name: "Arnold", gender: "male" },
      { voiceId: "pNInz6obpgDQGcFmaJgB", name: "Adam", gender: "male" },
      { voiceId: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", gender: "male" },
      { voiceId: "9BWtsMINqrJLrRacOk9x", name: "Aria", gender: "female" },
    ];
  }

  /**
   * Get default speaker ID
   */
  getDefaultSpeaker(): string {
    return this.defaultSpeaker;
  }
}

