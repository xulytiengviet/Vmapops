# Voice Realtime API Fixes

## Date: November 2, 2025

## Problem Summary

The voice interface was experiencing several critical issues:

1. **"conversation_already_has_active_response" Error**: OpenAI Realtime API was receiving new audio input while still processing a previous response
2. **Background Noise/Garbled Transcriptions**: Microphone picking up background audio, videos, music, and system sounds
3. **Incorrect Model Name**: Using `gpt-realtime-mini-2025-10-06` which appears to be invalid
4. **Feedback Loop**: Audio being sent while assistant was speaking, creating echo/feedback
5. **Poor Turn-Taking**: No proper conversation flow management

## Root Causes

### 1. No Response State Management
The server was accepting audio continuously without tracking whether the assistant was currently responding.

### 2. Client-Side Feedback Loop
The client was continuously sending microphone audio even while the assistant was speaking, creating a feedback loop.

### 3. VAD Settings Too Aggressive
Voice Activity Detection was too sensitive (threshold: 0.6, silence: 1200ms), triggering on background noise.

### 4. Wrong Model
The model name `gpt-realtime-mini-2025-10-06` doesn't match OpenAI's documented Realtime API models.

## Fixes Applied

### Server-Side Changes (`nextjs-frontend/server.js`)

#### Fix 1: Model Name Correction
```javascript
// BEFORE
model: 'gpt-realtime-mini-2025-10-06'

// AFTER
model: 'gpt-4o-realtime-preview-2024-10-01'
```

#### Fix 2: Response State Tracking
Added `isResponding` flag to track assistant response state:
```javascript
let isResponding = false; // Track if assistant is currently responding

// Set flag when assistant speaks
voiceInstance.on('speaking', ({ audio }) => {
  isResponding = true;
  // ... rest of code
});

// Clear flag when response completes
voiceInstance.on('openAIRealtime:response.done', () => {
  console.log('[Voice Server] Response complete - ready for next input');
  isResponding = false;
  socket.emit('status', 'ready');
});

// Clear flag on interruption
voiceInstance.on('openAIRealtime:conversation.interrupted', () => {
  console.log('[Voice Server] Conversation interrupted - clearing response state');
  isResponding = false;
  socket.emit('status', 'interrupted');
});
```

#### Fix 3: Block Audio During Response
Modified audio input handler to check response state:
```javascript
socket.on('audio', async (audioData) => {
  if (!voiceConnected || !voiceInstance) return;

  // BLOCK audio input if assistant is currently responding
  if (isResponding) {
    if (process.env.VOICE_DEBUG_AUDIO === '1') {
      console.log('[Voice Server] Blocking audio - assistant is responding');
    }
    return;
  }
  
  // ... rest of audio processing
});
```

#### Fix 4: Improved VAD Settings
Updated Voice Activity Detection for better noise filtering:
```javascript
turn_detection: {
  type: 'server_vad',
  threshold: 0.7,              // Increased from 0.6 (less sensitive)
  silence_duration_ms: 2500,   // Increased from 1200ms (longer silence required)
  prefix_padding_ms: 300,      // Added to capture speech start
}
```

#### Fix 5: Reset State on Manual Stop
```javascript
socket.on('stop-audio', () => {
  if (audioStream && !audioStream.destroyed) {
    console.log('[Voice Server] Ending audio stream');
    audioStream.end();
    audioStream = null;
  }
  // Reset responding state when user manually stops
  isResponding = false;
});
```

### Client-Side Changes (`nextjs-frontend/app/components/VoiceInterfaceRealtime.tsx`)

#### Fix 1: Track Assistant Speaking State
Added state variable to track when assistant is speaking:
```typescript
const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
```

#### Fix 2: Update State from Server Status
Modified status event handler to track speaking state:
```typescript
socket.on('status', (newStatus: string) => {
  console.log('[VoiceInterfaceRealtime] Status update:', newStatus);
  setStatus(newStatus);
  // Track if assistant is speaking to block audio input
  setIsAssistantSpeaking(newStatus === 'speaking');
});
```

#### Fix 3: Block Audio Input During Assistant Speech
Modified the audio worklet message handler to prevent feedback:
```typescript
micNode.port.onmessage = (event) => {
  if (!socketRef.current?.connected) return;
  // BLOCK audio if assistant is speaking (prevent feedback loop)
  if (isAssistantSpeaking) return;
  
  // ... rest of audio processing
};
```

## Expected Results

After these fixes, the voice interface should:

1. ✅ **No More "conversation_already_has_active_response" Errors**: Proper state management prevents overlapping responses
2. ✅ **No Background Noise Transcriptions**: Improved VAD settings filter out ambient noise
3. ✅ **No Feedback Loops**: Client-side and server-side blocking prevents echo/feedback
4. ✅ **Correct Model Usage**: Using documented OpenAI Realtime API model
5. ✅ **Natural Turn-Taking**: Proper conversation flow with clear speaker transitions

## Testing Recommendations

1. **Test in a Quiet Environment First**: Verify basic functionality works
2. **Test with Background Noise**: Play music/videos to ensure they're filtered out
3. **Test Turn-Taking**: Verify assistant completes responses before accepting new input
4. **Test Interruptions**: Try interrupting the assistant mid-response
5. **Monitor Console Logs**: Watch for state transitions and error messages

## Debug Mode

To enable detailed audio logging:
```bash
export VOICE_DEBUG_AUDIO=1
```

This will log every audio chunk sent/received for debugging purposes.

## Additional Notes

- The voice interface uses OpenAI's Realtime API with server-side VAD (Voice Activity Detection)
- Audio is streamed continuously but blocked during assistant responses
- The system uses a dual-AudioContext architecture (one for recording at 48kHz, one for playback at 24kHz)
- Response state is tracked both server-side and client-side for robust turn-taking

## Next Steps (Optional Improvements)

1. **Add Visual Feedback**: Show when audio is being blocked during assistant speech
2. **Implement Push-to-Talk**: Allow manual control as an alternative to VAD
3. **Add Noise Gate**: Additional client-side filtering for very noisy environments
4. **Utterance Segmentation**: Consider implementing utterance-based audio sending instead of continuous streaming
5. **Error Recovery**: Add automatic reconnection on errors

## Files Modified

1. `nextjs-frontend/server.js` - Server-side voice handling
2. `nextjs-frontend/app/components/VoiceInterfaceRealtime.tsx` - Client-side voice interface
