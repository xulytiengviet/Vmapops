# Real-time Voice Implementation with Mastra

## Overview

This document describes the real-time voice implementation using Mastra's OpenAI Realtime Voice API with WebSocket support.

## Architecture

```
Browser (VoiceInterfaceRealtime)
    ↓ WebSocket (Socket.IO)
Custom Next.js Server (server.js)
    ↓ Mastra OpenAIRealtimeVoice
OpenAI Realtime API
    ↓ Audio Response
Custom Next.js Server
    ↓ WebSocket (Socket.IO)
Browser (Audio Playback)
```

## What Changed

### 1. Custom Next.js Server

**File:** `nextjs-frontend/server.js`

- Custom HTTP server using Node.js `http.createServer()`
- Socket.IO integration for WebSocket communication
- Loads Mastra agent with voice capabilities
- Handles bidirectional audio streaming
- Manages voice session lifecycle

**Key Features:**
- Connects to `cityAnalystAgent.voice` (OpenAI Realtime)
- Forwards browser audio → Mastra → OpenAI
- Forwards OpenAI audio → browser
- Handles RuntimeContext (user location, map state, saved places)

### 2. Updated Package Scripts

**File:** `nextjs-frontend/package.json`

```json
"scripts": {
  "dev": "node server.js",           // ← Now uses custom server
  "dev:next": "next dev -p 3000",    // ← Fallback to standard Next.js
  "start": "NODE_ENV=production node server.js",
  "start:next": "next start"
}
```

### 3. Voice Component

**File:** `nextjs-frontend/app/components/VoiceInterfaceRealtime.tsx`

- Socket.IO client connection
- Microphone audio capture (PCM 16kHz)
- Real-time audio streaming to server
- Audio playback from server
- Status indicators (connected, listening, speaking)
- Draggable UI

### 4. Agent Configuration

**File:** `nextjs-frontend/mastra/agents/cityAnalystAgent.ts`

Already configured with:
```typescript
voice: new OpenAIRealtimeVoice({
  speaker: "alloy",
  model: "gpt-4o-realtime-preview-2024-12-17"
})
```

## How It Works

### Client Side (Browser)

1. **Connection**
   ```typescript
   const socket = io(); // Connect to server
   socket.emit('init', { userLocation, mapState, savedPlaces });
   ```

2. **Audio Capture**
   - Request microphone access
   - Use Web Audio API to capture PCM audio
   - Convert Float32Array → Int16Array
   - Stream to server via Socket.IO

3. **Audio Playback**
   - Receive Int16Array from server
   - Convert to Float32Array
   - Play using Web Audio API

### Server Side (Node.js)

1. **Voice Connection**
   ```typescript
   await cityAnalystAgent.voice.connect();
   ```

2. **Event Handling**
   ```typescript
   // Forward OpenAI audio to browser
   cityAnalystAgent.voice.on('speaker', ({ audio }) => {
     socket.emit('audio', Array.from(audio));
   });
   
   // Track conversation
   cityAnalystAgent.voice.on('writing', ({ text, role }) => {
     console.log(`${role}: ${text}`);
   });
   ```

3. **Audio Processing**
   ```typescript
   // Receive browser audio
   socket.on('audio', async (audioData) => {
     const int16Data = new Int16Array(audioData);
     const audioStream = Readable.from(...);
     await cityAnalystAgent.voice.send(audioStream);
   });
   ```

## Testing

### Prerequisites

1. Ensure `OPENAI_API_KEY` is set in `.env.local`
2. Stop any running dev servers

### Start the Server

```bash
cd nextjs-frontend
npm run dev
```

You should see:
```
> Ready on http://localhost:3000
> WebSocket server initialized for voice
[Custom Server] Socket.IO initialized
```

### Test Voice Interaction

1. **Open the app** in your browser: http://localhost:3000
2. **Allow microphone access** when prompted
3. **Look for the voice control bar** at the bottom center (draggable)
4. **Check connection status**:
   - Green dot = Connected
   - Red dot = Disconnected
5. **Click the microphone button** to start listening
6. **Speak**: "Find coffee shops nearby"
7. **Wait for response** (should be near real-time)

### Expected Console Logs

**Browser Console:**
```
[VoiceInterfaceRealtime] Initializing Socket.IO connection...
[VoiceInterfaceRealtime] Socket connected: <socket-id>
[VoiceInterfaceRealtime] Voice ready: Voice connection established
[VoiceInterfaceRealtime] Starting microphone...
[VoiceInterfaceRealtime] Microphone started, streaming audio
```

**Server Console:**
```
[Voice Server] Client connected: <socket-id>
[Voice Server] Initializing voice connection...
✅ [Voice Server] User location SET: { lat: 37.7606, lng: -122.3857 }
✅ [Voice Server] Voice connection established
[Voice Server] user: Find coffee shops nearby
[Voice Server] assistant: Looking for coffee shops near you...
```

## Advantages Over HTTP Voice

| Feature | HTTP (Old) | WebSocket (New) |
|---------|-----------|-----------------|
| Latency | 2-3 seconds | ~300ms |
| Bidirectional | No (request/response) | Yes (simultaneous) |
| VAD | Client-side (unreliable) | Server-side (OpenAI) |
| Interruption | No | Yes |
| Tool Integration | Separate flow | Direct |
| Streaming | No (chunked uploads) | Yes (continuous) |

## Known Limitations

### 1. Deployment

The custom server approach requires:
- Node.js environment (not serverless)
- Persistent WebSocket connections
- **Won't work** on standard Vercel deployment
- **Solutions**: 
  - Deploy to Railway, Render, or AWS
  - Use Vercel with custom server (requires Pro plan)

### 2. Audio Format

- Input: PCM 16kHz mono (Int16Array)
- Output: PCM 24kHz mono (Int16Array from OpenAI)
- Conversion handled automatically

### 3. Browser Compatibility

- Requires Web Audio API support
- Chrome, Firefox, Safari (modern versions)
- No IE support

### 4. Tool Execution (Not Yet Implemented)

Map commands from tool executions aren't forwarded yet. To add:

```typescript
// In server.js, after connecting voice
cityAnalystAgent.stream(messages, {
  runtimeContext,
  onStepFinish: (step) => {
    // Extract map commands
    const mapCommands = extractMapCommands(step);
    if (mapCommands) {
      socket.emit('mapCommands', mapCommands);
    }
  }
});
```

## Troubleshooting

### "Voice not configured on agent"

- Ensure `cityAnalystAgent.ts` has `voice: new OpenAIRealtimeVoice()`
- Check imports

### "OPENAI_API_KEY not found"

- Add to `.env.local`
- Restart server after adding

### Socket connection fails

- Check server is running on port 3000
- Check browser console for connection errors
- Ensure no firewall blocking WebSocket

### No audio playback

- Check browser's audio permissions
- Check speaker volume
- Look for Web Audio API errors in console

### Microphone not working

- Grant microphone permissions
- Check browser's privacy settings
- Test microphone in other apps

## Next Steps

### 1. Add Tool Execution Integration

Hook into agent's tool execution to forward map commands:
- Extract mapCommands from tool results
- Send to client via WebSocket
- Update map state in real-time

### 2. Add Voice Transcripts Display (Optional)

Show conversation history in UI:
- Listen to 'transcript' events
- Display in a transcript panel
- Allow user to review conversation

### 3. Improve Error Handling

- Reconnection logic
- Graceful fallback to HTTP voice
- Better user feedback

### 4. Production Deployment

- Choose hosting platform (Railway, Render, AWS)
- Set up environment variables
- Configure WebSocket CORS for production domain

## Files Modified

1. ✅ `server.js` - Custom Next.js server with WebSocket
2. ✅ `package.json` - Updated scripts to use custom server
3. ✅ `app/page.tsx` - Switched to VoiceInterfaceRealtime
4. ✅ `app/components/VoiceInterfaceRealtime.tsx` - Updated Socket.IO path
5. ✅ `mastra/agents/cityAnalystAgent.ts` - Added OpenAIRealtimeVoice (earlier)

## Files to Keep

- `app/api/voice/listen/route.ts` - Still used by VoiceButtonFloating (fallback)
- `app/api/voice/speak/route.ts` - Still used by VoiceButtonFloating (fallback)
- `lib/services/voice-service.ts` - May be useful for fallback

## References

- [Mastra Voice Documentation](https://mastra.ai/docs/voice/overview)
- [OpenAI Realtime Voice Reference](https://mastra.ai/reference/voice/openai-realtime)
- [Socket.IO Documentation](https://socket.io/docs/v4/)

---

**Status:** ✅ Implementation Complete - Ready for Testing

**Last Updated:** November 2, 2025
