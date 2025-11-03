# Migration from OpenAI Realtime API to ElevenLabs Voice

## Date: November 2, 2025

## Why We Switched

The OpenAI Realtime API was experiencing persistent issues:
- Frequent "conversation_already_has_active_response" errors
- Poor transcription quality with background noise
- Unreliable conversation flow
- General instability in production use

## What Changed

**Before:**
- `VoiceInterfaceRealtime` using OpenAI Realtime API
- End-to-end streaming (STT + LLM + TTS in one)
- Custom WebSocket server (`server.js`)

**After:**
- `VoiceInterface` using proven pipeline:
  - **Whisper API** for Speech-to-Text (OpenAI STT)
  - **Mastra Agent** for processing + tool calling
  - **ElevenLabs API** for Text-to-Speech (high-quality voice)

## Benefits of ElevenLabs Approach

1. ✅ **Superior Voice Quality**: ElevenLabs is industry-leading for natural TTS
2. ✅ **Reliability**: Each component is stable and battle-tested
3. ✅ **Debugging**: Easier to debug - can see each step separately
4. ✅ **Tool Calling**: Full support for all Mastra tools
5. ✅ **Flexibility**: Can swap out any component independently

## Architecture Comparison

### OpenAI Realtime API (Old)
```
Microphone → WebSocket → OpenAI Realtime API → Speaker
                ↓
            [STT + LLM + TTS all in one black box]
```

### ElevenLabs Pipeline (New)
```
Microphone → Whisper STT → Mastra Agent → ElevenLabs TTS → Speaker
                              ↓
                         Tool Execution
                              ↓
                         Map Updates
```

## Tradeoffs

**What We Gained:**
- Much more reliable operation
- Better voice quality (ElevenLabs > OpenAI voices)
- Clearer error messages
- Full control over each step
- Better VAD (Voice Activity Detection)

**What We Lost:**
- ~1-2 seconds higher latency (sequential vs streaming)
- No real-time interruptions (can't interrupt mid-sentence)
- Slightly higher API costs (3 APIs vs 1)

## Implementation Details

### VoiceInterface.tsx Features

1. **Speech-to-Text**: Uses OpenAI Whisper via `/api/voice/listen`
2. **Voice Activity Detection**: Client-side VAD with automatic silence detection
3. **Agent Integration**: Uses Mastra chat API with full tool calling
4. **Text-to-Speech**: ElevenLabs with streaming sentence synthesis
5. **Auto-Resume**: Automatically resumes listening after response

### Voice Quality Settings

Default speaker: `9BWtsMINqrJLrRacOk9x` (Aria - ElevenLabs voice)

You can change the voice by:
1. Getting available voices: `GET /api/voice/speakers`
2. Selecting a different voice ID in `VoiceInterface.tsx`

### API Keys Required

Make sure your `.env.local` has:
```env
OPENROUTER_API_KEY=your_key_here          # For Mastra agent
OPENAI_API_KEY=your_key_here              # For Whisper STT
ELEVENLABS_API_KEY=your_key_here          # For ElevenLabs TTS
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_key  # For maps
```

## Testing the New Implementation

1. Start the dev server:
```bash
cd nextjs-frontend
npm run dev
```

2. Open http://localhost:3000

3. Look for the voice control bar at the bottom of the screen

4. Grant microphone permissions when prompted

5. The interface will automatically start listening

6. Speak naturally - VAD will detect when you stop speaking

7. The agent will process your request and respond with ElevenLabs voice

## Monitoring & Debugging

Check console logs for:
- `[VoiceInterface]` - Main voice interface events
- Transcription results from Whisper
- Agent responses and tool calls
- ElevenLabs TTS generation

## Customization Options

### Adjust VAD Sensitivity

In `VoiceInterface.tsx`, modify the `setupVAD()` function:
```typescript
if (average < 25) {  // Lower = more sensitive
    // Silence detected
}
```

### Change Silence Duration

```typescript
silenceTimerRef.current = setTimeout(() => {
    // ...
}, 1500);  // Adjust ms value (1500 = 1.5 seconds)
```

### Change Voice Model

In `VoiceInterface.tsx`:
```typescript
const [selectedSpeaker] = useState<string>('9BWtsMINqrJLrRacOk9x');
// Change to any ElevenLabs voice ID
```

## Reverting to OpenAI Realtime (Not Recommended)

If you need to revert, change `page.tsx`:
```typescript
// Change this:
import { VoiceInterface } from './components/VoiceInterface';

// Back to:
import { VoiceInterfaceRealtime } from './components/VoiceInterfaceRealtime';

// And in JSX:
<VoiceInterface />  // Change to:
<VoiceInterfaceRealtime />
```

But note: The fixes we applied may not fully resolve all issues.

## Future Improvements

1. **Streaming TTS**: ElevenLabs supports streaming - could reduce latency
2. **Push-to-Talk**: Add manual control as an alternative to VAD
3. **Multi-Speaker**: Support conversation between multiple voices
4. **Voice Cloning**: Use ElevenLabs voice cloning for custom voices
5. **Emotion Control**: ElevenLabs supports emotional tone adjustment

## Cost Comparison

**OpenAI Realtime API:**
- $60-100/million audio tokens (all-in-one)

**ElevenLabs Pipeline:**
- Whisper STT: ~$0.006/minute
- LLM (via OpenRouter): varies by model
- ElevenLabs TTS: ~$0.30/1000 characters

For typical use, the pipeline approach is **comparable or cheaper** while being more reliable.

## Conclusion

The ElevenLabs pipeline is the production-ready solution for MapOps voice features. It provides superior voice quality, better reliability, and full tool calling support with only a slight latency tradeoff.

The OpenAI Realtime API remains experimental - we can revisit it when Mastra's implementation matures or OpenAI improves the API stability.
