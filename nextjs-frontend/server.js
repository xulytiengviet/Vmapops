/**
 * Custom Next.js Server with WebSocket Support for Mastra Voice
 * 
 * This server enables real-time voice interactions using:
 * - Socket.IO for WebSocket communication
 * - Mastra's OpenAI Realtime Voice API
 * - cityAnalystAgent with voice capabilities
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { Readable } = require('stream');

// Next.js app setup
const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Dynamic import for ESM modules
let cityAnalystAgent;
let RuntimeContext;
let OpenAIRealtimeVoice;
let agentTools;

async function loadMastra() {
  try {
    console.log('[Custom Server] Loading Mastra modules...');
    
    const agentModule = await import('./mastra/agents/cityAnalystAgent.ts');
    cityAnalystAgent = agentModule.cityAnalystAgent || agentModule.default?.cityAnalystAgent || agentModule.default;
    
    if (!cityAnalystAgent) {
      console.error('[Custom Server] Agent not found in module');
      throw new Error('Failed to load cityAnalystAgent from module');
    }
    
    console.log('✅ [Custom Server] cityAnalystAgent loaded');
    
    // Import tools from the tools module
    const toolsModule = await import('./mastra/tools/index.ts');
    
    // Debug: Log what's actually in the module
    console.log('[Custom Server] toolsModule keys:', Object.keys(toolsModule));
    console.log('[Custom Server] toolsModule.default?', !!toolsModule.default);
    
    // Build tools object, trying multiple access patterns
    agentTools = {};
    const toolNames = [
      'search-places',
      'search-along-route',
      'geocode',
      'get-directions',
      'get-place-details',
      'calculate-distance-matrix',
      'map-control',
      'map-observe',
      'navigate-to-place',
      'trip-plan',
    ];
    
    const toolMap = {
      'search-places': 'searchPlaces',
      'search-along-route': 'searchAlongRoute',
      'geocode': 'geocode',
      'get-directions': 'getDirections',
      'get-place-details': 'getPlaceDetails',
      'calculate-distance-matrix': 'calculateDistanceMatrix',
      'map-control': 'mapControl',
      'map-observe': 'mapObserve',
      'navigate-to-place': 'navigateToPlace',
      'trip-plan': 'tripPlan',
    };
    
    for (const toolName of toolNames) {
      const exportName = toolMap[toolName];
      
      // Try multiple access patterns
      let tool = toolsModule[exportName] || 
                 toolsModule.default?.[exportName] ||
                 toolsModule[toolName];
      
      if (tool) {
        agentTools[toolName] = tool;
        console.log(`[Custom Server] ✅ Loaded tool: ${exportName}`);
      } else {
        console.warn(`[Custom Server] ❌ Tool ${exportName} is undefined, skipping`);
        
        // Debug: Check what keys are available for this tool
        const possibleKeys = Object.keys(toolsModule).filter(k => 
          k.toLowerCase().includes(exportName.toLowerCase()) || 
          k.toLowerCase().includes(toolName.replace('-', ''))
        );
        if (possibleKeys.length > 0) {
          console.log(`[Custom Server]   Possible matches found: ${possibleKeys.join(', ')}`);
        }
      }
    }
    
    console.log('✅ [Custom Server] Agent tools loaded:', Object.keys(agentTools).length, 'tools');
    
    if (Object.keys(agentTools).length === 0) {
      console.error('[Custom Server] WARNING: No tools loaded! Voice will not have any functionality.');
    }
    
    const runtimeModule = await import('@mastra/core/runtime-context');
    RuntimeContext = runtimeModule.RuntimeContext;
    console.log('✅ [Custom Server] RuntimeContext loaded');
    
    // Import OpenAIRealtimeVoice for separate initialization
    const voiceModule = await import('@mastra/voice-openai-realtime');
    OpenAIRealtimeVoice = voiceModule.OpenAIRealtimeVoice;
    console.log('✅ [Custom Server] OpenAIRealtimeVoice loaded');
    
  } catch (error) {
    console.error('[Custom Server] Error loading Mastra:', error);
    throw error;
  }
}

app.prepare().then(async () => {
  // Load Mastra modules
  await loadMastra();
  
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Initialize Socket.IO
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  console.log('[Custom Server] Socket.IO initialized');

  // WebSocket connection handler
  io.on('connection', async (socket) => {
    console.log('[Voice Server] Client connected:', socket.id);

    let voiceInstance = null;
    let voiceConnected = false;
    let runtimeContext = null;
    let audioBuffer = [];

    // Initialize voice connection
    socket.on('init', async (data) => {
      try {
        console.log('[Voice Server] Initializing voice connection...');
        
        // Create runtime context
        runtimeContext = new RuntimeContext();
        
        if (data.userLocation) {
          runtimeContext.set('userLocation', data.userLocation);
          console.log('✅ [Voice Server] User location SET:', data.userLocation);
        }
        
        if (data.mapState?.center) {
          runtimeContext.set('mapCenter', data.mapState.center);
        }
        
        if (data.mapState?.zoom) {
          runtimeContext.set('mapZoom', data.mapState.zoom);
        }
        
        if (data.mapState?.bounds) {
          runtimeContext.set('mapBounds', data.mapState.bounds);
        }
        
        if (data.savedPlaces) {
          runtimeContext.set('savedPlaces', data.savedPlaces);
          console.log('✅ [Voice Server] Saved places SET:', Object.keys(data.savedPlaces));
        }

        // Create separate voice instance (not attached to agent due to function-based instructions)
        voiceInstance = new OpenAIRealtimeVoice({
          speaker: 'alloy',
          model: 'gpt-4o-realtime-preview-2024-12-17',
        });

        console.log('✅ [Voice Server] Voice instance created');

        // Add tools to voice instance (from cityAnalystAgent)
        voiceInstance.addTools(agentTools);
        console.log('✅ [Voice Server] Tools added to voice instance');

        // Connect to OpenAI Realtime API
        await voiceInstance.connect();
        voiceConnected = true;
        console.log('✅ [Voice Server] Voice connection established');

        // Configure session with static instructions and VAD
        const userLocationText = data.userLocation 
          ? `The user's current location is ${data.userLocation.lat.toFixed(4)}, ${data.userLocation.lng.toFixed(4)}`
          : "The user's location is not currently available.";

        voiceInstance.updateConfig({
          instructions: `You are MapOps, a voice-first conversational city analyst with access to real-time geographic data from Google Maps APIs.

${userLocationText}

**Keep responses concise for voice interaction:**
- 2-3 sentences maximum per response
- Let the map show details - you provide context
- Example: "I found 5 coffee shops nearby. The closest is Blue Bottle, just 3 minutes away."
- Acknowledge what you're doing then briefly explain results

**MUST call tools for:**
- Finding places (coffee, restaurants, etc.) → search-places
- Getting directions → get-directions
- Locating addresses → geocode
- Map controls → map-control

**When user says "near me" or "nearby":**
- IMMEDIATELY call search-places with user's location
- DO NOT ask for location - use what you have

**Answer ONLY from API data - do not hallucinate or invent details.**`,
          turn_detection: {
            type: 'server_vad',
            threshold: 0.6,
            silence_duration_ms: 1200,
          },
        });
        console.log('✅ [Voice Server] Session configured with instructions and VAD');

        // Listen to voice events
        voiceInstance.on('speaker', ({ audio }) => {
          // Forward audio to client
          socket.emit('audio', Array.from(audio));
          socket.emit('status', 'speaking');
        });

        voiceInstance.on('writing', ({ text, role }) => {
          console.log(`[Voice Server] ${role}: ${text}`);
          socket.emit('transcript', { text, role });
          
          if (role === 'assistant') {
            socket.emit('status', 'speaking');
          } else {
            socket.emit('status', 'listening');
          }
        });

        voiceInstance.on('error', (error) => {
          console.error('[Voice Server] Voice error:', error);
          socket.emit('error', { message: error.message || 'Voice error occurred' });
        });

        // OpenAI Realtime events
        voiceInstance.on('openAIRealtime:conversation.interrupted', () => {
          socket.emit('status', 'interrupted');
        });

        voiceInstance.on('openAIRealtime:conversation.item.completed', () => {
          socket.emit('status', 'completed');
        });

        socket.emit('ready', { message: 'Voice connection established' });
        
      } catch (error) {
        console.error('[Voice Server] Init error:', error);
        socket.emit('error', { message: error.message || 'Failed to initialize voice' });
      }
    });

    // Receive audio from client
    socket.on('audio', async (audioData) => {
      if (!voiceConnected || !voiceInstance) {
        console.warn('[Voice Server] Audio received but voice not connected');
        return;
      }

      try {
        // Convert array back to Int16Array
        const int16Data = new Int16Array(audioData);
        
        // Add to buffer
        audioBuffer.push(int16Data);
        
        // Send buffered audio to Mastra voice
        // Create a readable stream from the audio buffer
        const audioStream = Readable.from((async function* () {
          for (const chunk of audioBuffer) {
            yield Buffer.from(chunk.buffer);
          }
          audioBuffer = []; // Clear buffer after sending
        })());
        
        // Send to OpenAI Realtime API
        await voiceInstance.send(audioStream);
        
      } catch (error) {
        console.error('[Voice Server] Audio processing error:', error);
        socket.emit('error', { message: error.message || 'Failed to process audio' });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log('[Voice Server] Client disconnected:', socket.id);
      
      if (voiceConnected && voiceInstance) {
        try {
          voiceInstance.close();
        } catch (error) {
          console.error('[Voice Server] Error closing voice:', error);
        }
      }
      
      voiceInstance = null;
      audioBuffer = [];
    });
  });

  // Start server
  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log('> WebSocket server initialized for voice');
  });
});
