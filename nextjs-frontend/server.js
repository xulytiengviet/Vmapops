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
    
    // Note: cityAnalystAgent is not actually used in this server
    // (we create a separate OpenAIRealtimeVoice instance)
    // But we load it for potential future use
    const agentModule = await import('./mastra/agents/cityAnalystAgent.ts');
    if (agentModule.getCityAnalystAgent) {
      cityAnalystAgent = await agentModule.getCityAnalystAgent();
      console.log('✅ [Custom Server] cityAnalystAgent loaded');
    } else {
      console.log('⚠️ [Custom Server] cityAnalystAgent not available (not needed for voice server)');
    }
    
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
          model: 'gpt-realtime-mini-2025-10-06',
        });

        console.log('✅ [Voice Server] Voice instance created');

        // Add tools to voice instance with runtime context binding
        const toolsWithContext = {};
        for (const [toolName, tool] of Object.entries(agentTools)) {
          // Wrap each tool to inject runtime context
          toolsWithContext[toolName] = {
            ...tool,
            execute: async (params) => {
              // Call original execute with runtime context
              return tool.execute({
                ...params,
                runtimeContext,
              });
            },
          };
        }
        
        voiceInstance.addTools(toolsWithContext);
        console.log('✅ [Voice Server] Tools added to voice instance with runtime context');

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

        // Listen to voice events - use 'speaking' not 'speaker'
        voiceInstance.on('speaking', ({ audio }) => {
          // Forward audio to client - prefer binary buffers to avoid JSON overhead
          if (audio) {
            console.log('[Voice Server] Received audio chunk, length:', audio.length);
            try {
              // Emit as ArrayBuffer when possible for efficient transport
              const buf = audio.buffer ? audio.buffer : Buffer.from(audio);
              socket.emit('audio', buf);
            } catch (e) {
              // Fallback to number array if something goes wrong
              socket.emit('audio', Array.from(audio));
            }
            socket.emit('status', 'speaking');
          } else {
            console.warn('[Voice Server] Speaking event received with no audio');
          }
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

        // Listen for tool invocations
        voiceInstance.on('openAIRealtime:function_call_arguments.done', (event) => {
          console.log('[Voice Server] Tool being called:', event.name);
          console.log('[Voice Server] Tool arguments:', event.arguments);
        });
        
        voiceInstance.on('openAIRealtime:response.function_call_arguments.done', (event) => {
          console.log('[Voice Server] Tool response received for:', event.name);
        });

        // OpenAI Realtime events
        voiceInstance.on('openAIRealtime:conversation.interrupted', () => {
          console.log('[Voice Server] Conversation interrupted');
          socket.emit('status', 'interrupted');
        });

        voiceInstance.on('openAIRealtime:conversation.item.completed', () => {
          console.log('[Voice Server] Conversation item completed');
          socket.emit('status', 'completed');
        });
        
        voiceInstance.on('openAIRealtime:response.audio_transcript.delta', (event) => {
          console.log('[Voice Server] Audio transcript delta:', event.delta);
        });
        
        voiceInstance.on('openAIRealtime:input_audio_buffer.speech_started', () => {
          console.log('[Voice Server] Speech started');
        });
        
        voiceInstance.on('openAIRealtime:input_audio_buffer.speech_stopped', () => {
          console.log('[Voice Server] Speech stopped');
        });

        socket.emit('ready', { message: 'Voice connection established' });
        
      } catch (error) {
        console.error('[Voice Server] Init error:', error);
        socket.emit('error', { message: error.message || 'Failed to initialize voice' });
      }
    });

    // Initialize audio stream for this connection
    let audioStream = null;
    let audioStreamController = null;
    
    // Receive audio from client
    socket.on('audio', async (audioData) => {
      if (!voiceConnected || !voiceInstance) {
        console.warn('[Voice Server] Audio received but voice not connected');
        return;
      }

      try {
        // First chunk - create a continuous stream
        if (!audioStream) {
          console.log('[Voice Server] Creating audio stream for continuous sending');
          
          // Create a PassThrough stream that we can write to continuously
          const { PassThrough } = require('stream');
          audioStream = new PassThrough();
          
          // Send the stream to OpenAI (only once)
          voiceInstance.send(audioStream).catch(error => {
            console.error('[Voice Server] Error sending stream to OpenAI:', error);
          });
          
          console.log('[Voice Server] Audio stream connected to OpenAI');
        }
        
        // Convert array back to Int16Array
        const int16Data = new Int16Array(audioData);
        
        // Convert to Buffer for OpenAI
        const buffer = Buffer.from(int16Data.buffer);
        
        // Write chunk to the continuous stream
        if (audioStream && !audioStream.destroyed) {
          audioStream.write(buffer);
          console.log('[Voice Server] Audio chunk written to stream, size:', buffer.length);
        }
        
      } catch (error) {
        console.error('[Voice Server] Audio processing error:', error);
        socket.emit('error', { message: error.message || 'Failed to process audio' });
      }
    });
    
    // Handle stopping audio stream
    socket.on('stop-audio', () => {
      if (audioStream && !audioStream.destroyed) {
        console.log('[Voice Server] Ending audio stream');
        audioStream.end();
        audioStream = null;
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
