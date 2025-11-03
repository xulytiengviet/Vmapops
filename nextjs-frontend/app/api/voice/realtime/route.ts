/**
 * WebSocket API Route for OpenAI Realtime Voice
 * Handles bidirectional audio streaming with Mastra agent
 */

import { NextRequest } from "next/server";
import { Server as SocketIOServer } from "socket.io";
import { getCityAnalystAgent } from "@/mastra/agents/cityAnalystAgent";
import { RuntimeContext } from "@mastra/core/runtime-context";
import type { CityAnalystRuntimeContext } from "@/mastra/agents/cityAnalystAgent";

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

// Global Socket.IO server instance
let io: SocketIOServer | null = null;

function initSocketIO(res: any) {
  if (!io) {
    io = new SocketIOServer(res.socket.server, {
      path: "/api/voice/realtime/socket",
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    io.on("connection", async (socket) => {
      console.log("[Voice Realtime] Client connected:", socket.id);

      let voiceConnected = false;
      let runtimeContext: RuntimeContext<any> | null = null;
      let cityAnalystAgent: Awaited<ReturnType<typeof getCityAnalystAgent>> | null = null;

      // Initialize voice connection
      socket.on("init", async (data: {
        userLocation?: { lat: number; lng: number };
        mapState?: any;
        savedPlaces?: any;
      }) => {
        try {
          console.log("[Voice Realtime] Initializing voice connection...");
          
          // Create runtime context using same pattern as chat route
          runtimeContext = new RuntimeContext<CityAnalystRuntimeContext>();
          
          if (data.userLocation) {
            runtimeContext.set("userLocation", data.userLocation);
            console.log("✅ [Voice Realtime] User location SET:", data.userLocation);
          }
          
          if (data.mapState?.center) {
            runtimeContext.set("mapCenter", data.mapState.center);
          }
          
          if (data.mapState?.zoom) {
            runtimeContext.set("mapZoom", data.mapState.zoom);
          }
          
          if (data.mapState?.bounds) {
            runtimeContext.set("mapBounds", data.mapState.bounds);
          }
          
          if (data.savedPlaces) {
            runtimeContext.set("savedPlaces", data.savedPlaces);
            console.log("✅ [Voice Realtime] Saved places SET:", Object.keys(data.savedPlaces));
          }

          // Get the agent (store in socket scope for use in other handlers)
          cityAnalystAgent = await getCityAnalystAgent();

          // Connect to agent's voice
          if (!cityAnalystAgent.voice) {
            throw new Error("Voice not configured on agent");
          }

          await cityAnalystAgent.voice.connect();
          voiceConnected = true;

          // Listen to voice events
          cityAnalystAgent.voice.on("speaking", ({ audio }) => {
            // Forward audio to client
            socket.emit("audio", audio);
          });

          cityAnalystAgent.voice.on("writing", ({ text, role }) => {
            console.log(`[Voice Realtime] ${role}: ${text}`);
            // Emit status updates
            if (role === "assistant") {
              socket.emit("status", "speaking");
            } else {
              socket.emit("status", "listening");
            }
          });

          cityAnalystAgent.voice.on("error", (error) => {
            console.error("[Voice Realtime] Voice error:", error);
            socket.emit("error", { message: error.message || "Voice error occurred" });
          });

          // Listen to OpenAI Realtime events for better state tracking
          cityAnalystAgent.voice.on("openAIRealtime:conversation.interrupted", () => {
            socket.emit("status", "interrupted");
          });

          cityAnalystAgent.voice.on("openAIRealtime:conversation.item.completed", () => {
            socket.emit("status", "completed");
          });

          socket.emit("ready", { message: "Voice connection established" });
          console.log("[Voice Realtime] Voice connection established");
        } catch (error: any) {
          console.error("[Voice Realtime] Init error:", error);
          socket.emit("error", { message: error.message || "Failed to initialize voice" });
        }
      });

      // Receive audio from client
      socket.on("audio", async (audioData: Int16Array) => {
        if (!voiceConnected || !cityAnalystAgent?.voice) {
          console.warn("[Voice Realtime] Audio received but voice not connected");
          return;
        }

        try {
          // Send audio to agent's voice
          // The OpenAI Realtime Voice expects a stream, so we need to handle this differently
          // For now, we'll use the speak/listen methods
          // Note: This is a simplified implementation - full streaming would require more setup
          console.log("[Voice Realtime] Received audio chunk, length:", audioData.length);
          
          // Update status to show we're processing
          socket.emit("status", "thinking");
        } catch (error: any) {
          console.error("[Voice Realtime] Audio processing error:", error);
          socket.emit("error", { message: error.message || "Failed to process audio" });
        }
      });

      // Handle map command forwarding (from tool executions)
      socket.on("mapCommand", (command: any) => {
        // This would be used if tools need to send map commands during voice conversation
        // Tools would emit these through the agent
        socket.emit("mapCommands", [command]);
      });

      // Disconnect
      socket.on("disconnect", async () => {
        console.log("[Voice Realtime] Client disconnected:", socket.id);
        
        if (voiceConnected && cityAnalystAgent?.voice) {
          try {
            cityAnalystAgent.voice.close();
          } catch (error) {
            console.error("[Voice Realtime] Error closing voice:", error);
          }
        }
      });
    });

    console.log("[Voice Realtime] Socket.IO server initialized");
  }
}

export async function GET(_req: NextRequest) {
  const res: any = {
    socket: {
      server: {},
    },
  };

  initSocketIO(res);

  return new Response("WebSocket endpoint for voice realtime", {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
    },
  });
}
