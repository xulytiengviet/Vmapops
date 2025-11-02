# Voice Implementation Status - OpenAI Realtime Voice

## Current Implementation Overview

This document tracks the migration from HTTP-based voice (Whisper STT + ElevenLabs TTS) to WebSocket-based OpenAI Realtime Voice with Mastra.

## ✅ Completed Steps

1. **Installed Dependencies**
   - `@mastra/voice-openai-realtime` already installed (v0.11.11)
   
2. **Updated Agent Configuration**
   - File: `nextjs-frontend/mastra/agents/cityAnalystAgent.ts`
   - Added `OpenAIRealtimeVoice` import
   - Configured voice on agent:
     ```typescript
     voice: new OpenAIRealtimeVoice({
       speaker: "alloy",
       model: "gpt-4o-realtime-preview-2024-12-17"
     })
     ```
   - Added voice-optimized instructions (concise 2-3 sentence responses)

3. **Created WebSocket API Route (Initial)**
   - File: `nextjs-frontend/app/api/voice/realtime/route.ts`
   - Uses Socket.IO for bidirectional communication
   - Handles RuntimeContext (user location, map state, saved places)
   - Event handlers for voice status and map commands

4. **Created New Voice Component**
   - File: `nextjs-frontend/app/components/VoiceInterfaceRealtime.tsx`
   - Socket.IO client connection
   - Microphone audio streaming (PCM 16kHz)
   - Audio playback for responses
   - Draggable UI with status indicators

## ⚠️ Critical Issues & Limitations

### Issue 1: WebSocket Architecture Mismatch

**Problem:** The current Socket.IO implementation doesn't properly integrate with OpenAI's Realtime Voice API.

**Why:**
- OpenAI Realtime Voice uses a **direct WebSocket connection** to OpenAI's servers
- Mastra's `OpenAIRealtimeVoice` is designed to establish this connection
- The current Socket.IO layer acts as an intermediary, but doesn't properly forward the WebSocket protocol
- Audio streaming through Socket.IO → Mastra → OpenAI adds unnecessary complexity and latency

**What's Missing:**
- The Mastra voice API expects to use methods like:
  - `voice.speak(text)` - Send text or stream to convert to speech
  - `voice.listen(audioStream)` - Process audio for transcription
  - `voice.send(audioStream)` - Real-time audio streaming
- Our Socket.IO implementation receives audio chunks but doesn't properly call these methods

### Issue 2: Next.js WebSocket Limitations

**Problem:** Next.js is designed for serverless/edge deployments and doesn't natively support persistent WebSocket servers.

**Why:**
- WebSocket requires a long-running server process
- Next.js API routes are designed to be stateless
- Socket.IO can work but requires custom server setup
- Vercel and other serverless platforms have WebSocket connection limits

### Issue 3: Agent Conversation Flow

**Problem:** The voice system needs to integrate with the agent's tool execution flow.

**Missing:**
- When agent calls tools during voice conversation, map commands need to be extracted and sent to client
- Current implementation has placeholder for this but it's not connected
- Need to hook into agent's `onStepFinish` callback during voice conversation

## 🔧 Recommended Solutions

### Option A: Use Mastra's Voice API Correctly (Recommended)

Instead of Socket.IO, use Mastra's voice methods directly:

```typescript
// Server-side voice session
const session = await cityAnalystAgent.voice.connect();

// Send microphone stream
await cityAnalystAgent.voice.send(microphoneStream);

// Listen for events
cityAnalystAgent.voice.on('speaking', ({ audio }) => {
  // Send to client via response stream
});

cityAnalystAgent.voice.on('writing', ({ text, role }) => {
  // Track conversation
});
```

**However:** This still requires a persistent connection, which is challenging in Next.js.

### Option B: Use Mastra CLI Voice Mode

Mastra may have a built-in CLI tool for voice interactions:

```bash
npx mastra voice --agent cityAnalystAgent
```

Check Mastra documentation for voice CLI tools.

### Option C: Custom Node.js Server (Most Robust)

Create a separate Node.js server for voice:

```
/voice-server (separate from Next.js)
  ├── server.ts - WebSocket server
  ├── voice-session.ts - Manages Mastra voice connections
  └── package.json
```

This server would:
1. Run independently (e.g., on port 3001)
2. Accept WebSocket connections from the Next.js client
3. Establish Mastra voice connections
4. Forward audio bidirectionally
5. Extract map commands from tool executions
6. Send map commands back to client

### Option D: Client-Side OpenAI Realtime (Security Risk)

Use OpenAI's Realtime API directly from the browser:
- Requires exposing OpenAI API key to client
- **Not recommended** for production
- Could work for prototyping

## 📋 Next Steps

### Immediate Actions Needed

1. **Test Current Implementation**
   - Try running the Socket.IO server
   - Check if voice connection establishes
   - Monitor console for errors

2. **Review Mastra Voice Documentation**
   - Check if Mastra has examples for Next.js voice integration
   - Look for built-in voice UI components
   - Search for WebSocket server examples

3. **Decide on Architecture**
   - Choose between Options A-D above
   - Consider deployment environment (Vercel, AWS, etc.)
   - Evaluate development complexity vs. feature requirements

4. **Implement Proper Audio Streaming**
   - If continuing with current approach, properly call `voice.send()`
   - Convert Socket.IO events to Mastra voice method calls
   - Handle audio encoding/decoding correctly

5. **Integrate Tool Execution**
   - Hook into agent's tool execution during voice conversation
   - Extract map commands from tool results
   - Forward commands to client via WebSocket

6. **Add Error Recovery**
   - Handle WebSocket disconnections
   - Reconnection logic
   - Graceful fallback to text chat

## 📊 Comparison with Previous Implementation

| Feature | Old (HTTP) | New (WebSocket) | Status |
|---------|-----------|-----------------|--------|
| Speech-to-Text | OpenAI Whisper | OpenAI Realtime | ⚠️ Partial |
| Text-to-Speech | ElevenLabs | OpenAI Realtime | ⚠️ Partial |
| Latency | 2-3 seconds | ~300ms (target) | ❌ Not achieved |
| VAD | Client-side | Server-side | ✅ Configured |
| Interruption | No | Yes | ❌ Not implemented |
| Tool Integration | Via chat flow | Direct | ❌ Not implemented |
| Map Updates | Works | Works (planned) | ❌ Not connected |

## 🔍 Testing Checklist

- [ ] WebSocket connection establishes
- [ ] Microphone audio streams to server
- [ ] Audio is received and playable
- [ ] Voice recognition works (user speech → text)
- [ ] Agent responds with voice
- [ ] Tools execute during voice conversation
- [ ] Map commands update the map
- [ ] Interruption works (user can cut off agent)
- [ ] Reconnection after disconnect
- [ ] Mobile browser compatibility
- [ ] Performance under load

## 📚 Required Environment Variables

```env
# Required for OpenAI Realtime Voice
OPENAI_API_KEY=your-openai-key

# No longer needed (can remove)
# ELEVENLABS_API_KEY=your-elevenlabs-key
```

## 🐛 Known Issues

1. **Socket.IO not properly integrated** - Need custom Next.js server or standalone voice server
2. **Audio streaming incomplete** - Socket.IO receives audio but doesn't call Mastra voice methods
3. **No tool execution integration** - Map commands from tools not forwarded to client
4. **TypeScript errors** - RuntimeContext type issues (fixed)
5. **Deployment challenges** - Won't work on standard Vercel deployment without custom server

## 📖 References

- [Mastra Voice OpenAI Realtime Documentation](https://mastra.ai/reference/voice/openai-realtime)
- [Mastra Call Analysis Example](https://mastra.ai/examples/voice/speech-to-speech)
- [OpenAI Realtime API Beta](https://github.com/openai/openai-realtime-api-beta)
- [Socket.IO Documentation](https://socket.io/docs/v4/)

## 🎯 Success Criteria

The voice implementation will be considered complete when:

1. ✅ User can speak and hear responses in real-time
2. ✅ Agent uses map tools during voice conversation
3. ✅ Map updates automatically from voice commands
4. ✅ Latency is under 1 second end-to-end
5. ✅ User can interrupt the agent mid-sentence
6. ✅ Connection is stable and recovers from errors
7. ✅ Works on desktop and mobile browsers
8. ✅ Deployable to production environment

---

**Last Updated:** November 2, 2025
**Status:** 🚧 In Progress - Architecture issues need resolution
**Next Action:** Test current implementation and decide on architecture path
