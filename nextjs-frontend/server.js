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
      // Restaurant + interaction tools
      'get-restaurant-menu',
      'get-popular-dishes',
      'check-booking-options',
      'generate-booking-link',
      'prepare-call-script',
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
      // Restaurant + interaction tools
      'get-restaurant-menu': 'getRestaurantMenu',
      'get-popular-dishes': 'getPopularDishes',
      'check-booking-options': 'checkBookingOptions',
      'generate-booking-link': 'generateBookingLink',
      'prepare-call-script': 'prepareCallScript',
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

    // Merge MCP tools (Tavily/Exa) so the voice agent has parity with chat agent
    try {
      const mcpModule = await import('./mastra/mcp/config.ts');
      if (mcpModule.getMCPTools) {
        const mcpTools = await mcpModule.getMCPTools();
        const mcpToolCount = Object.keys(mcpTools || {}).length;
        if (mcpToolCount > 0) {
          Object.assign(agentTools, mcpTools);
          console.log(`✅ [Custom Server] MCP tools added to voice: ${mcpToolCount} tools`);
        } else {
          console.log('[Custom Server] No MCP tools returned');
        }
      }
    } catch (e) {
      console.warn('[Custom Server] MCP tools not available for voice:', e?.message || e);
    }
    
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
    let hasUserSpoken = false;
    let lastUserText = '';

    // Heuristic intent detector to avoid premature tool calls
    const isActionableIntent = (text = '') => {
      const t = String(text).toLowerCase().trim();
      if (!t) return false;
      // Greetings / small talk
      const smallTalk = /(^(hi|hello|hey)\b)|\b(how (are|r) (you|u))\b|\b(thanks?|thank you)\b|\b(what's up)\b/;
      if (smallTalk.test(t) && !/(find|show|search|near|nearby|go to|navigate|directions|route|plan|trip|zoom|pan|center)/.test(t)) {
        return false;
      }
      // Actionable intents
      const intents = /(find|show|search|near|nearby|go to|navigate|directions|route|plan|trip|zoom|pan|center|where is|take me|open|save|clear)/;
      return intents.test(t);
    };

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
          model: 'gpt-4o-realtime-preview-2024-10-01',
        });

        console.log('✅ [Voice Server] Voice instance created');

        // Add tools to voice instance with runtime context binding
        const toolsWithContext = {};
        for (const [toolName, tool] of Object.entries(agentTools)) {
          // Wrap each tool to inject runtime context
          toolsWithContext[toolName] = {
            ...tool,
            execute: async (params) => {
              // Gate tool execution during small talk or vague queries
              if (!isActionableIntent(lastUserText)) {
                return { success: false, data: { mapCommands: [] } };
              }
              // Call original execute with runtime context
              const result = await tool.execute({
                ...params,
                runtimeContext,
              });
              // If tool returns mapCommands, forward them to the client so UI updates (ArtifactCarousel, MapView)
              try {
                const commands = result?.data?.mapCommands || result?.mapCommands;
                if (Array.isArray(commands) && commands.length > 0) {
                  socket.emit('mapCommands', commands);
                }
              } catch {}
              return result;
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
          instructions: `You are MapOps, a friendly voice-first city analyst. Be conversational and concise.

${userLocationText}

Voice style: speak one short sentence. Do not list many items aloud.

Tool use guardrails:
1) Greetings/small talk ("hi", "how are you") → reply briefly, ask how to help; DO NOT call tools.
2) Clarify when intent is vague ("find coffee" → "near you or a specific area?")
3) Execute tools only for clear intents (find/search/near me/nearby/directions to/go to/plan trip/route).
4) After a tool call, keep speech short and let the map/UI show details.

Available tools:
- search-places (places)
- get-directions or calculate-distance-matrix (routes/distance)
- geocode (addresses)
- map-control (zoom/pan)

For "near me" or "nearby", immediately call search-places with the user's location.

Answer only from tool data.`,
          turn_detection: {
            type: 'server_vad',
            threshold: 0.7, // Less sensitive to reduce false positives
            silence_duration_ms: 2500, // Longer silence before considering speech complete
            prefix_padding_ms: 300, // Add padding to capture speech start
          },
        });
        console.log('✅ [Voice Server] Session configured with instructions and VAD');

        // Listen to voice events - use 'speaking' not 'speaker'
        voiceInstance.on('speaking', ({ audio }) => {
          // Set responding flag when assistant starts speaking
          isResponding = true;
          // Ignore any assistant audio before the first user utterance
          if (!hasUserSpoken) return;
          // Forward audio to client - prefer binary buffers to avoid JSON overhead
          if (audio) {
            if (process.env.VOICE_DEBUG_AUDIO === '1') {
              console.log('[Voice Server] Received audio chunk, length:', audio.length);
            }
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
          if (role === 'user') {
            hasUserSpoken = true;
            lastUserText = text || '';
            socket.emit('transcript', { text, role });
            socket.emit('status', 'listening');
            return;
          }
          // Suppress any assistant text before the user speaks
          if (!hasUserSpoken && role === 'assistant') {
            return;
          }
          socket.emit('transcript', { text, role });
          socket.emit('status', 'speaking');
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
          console.log('[Voice Server] Conversation interrupted - clearing response state');
          isResponding = false;
          socket.emit('status', 'interrupted');
        });

        voiceInstance.on('openAIRealtime:conversation.item.completed', () => {
          console.log('[Voice Server] Conversation item completed');
          socket.emit('status', 'completed');
        });
        
        voiceInstance.on('openAIRealtime:response.done', () => {
          console.log('[Voice Server] Response complete - ready for next input');
          isResponding = false;
          socket.emit('status', 'ready');
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
    let isResponding = false; // Track if assistant is currently responding
    
    // Receive audio from client
    socket.on('audio', async (audioData) => {
      if (!voiceConnected || !voiceInstance) {
        console.warn('[Voice Server] Audio received but voice not connected');
        return;
      }

      // BLOCK audio input if assistant is currently responding
      if (isResponding) {
        if (process.env.VOICE_DEBUG_AUDIO === '1') {
          console.log('[Voice Server] Blocking audio - assistant is responding');
        }
        return;
      }

      try {
        // First chunk - create a continuous stream
        if (!audioStream) {
          if (process.env.VOICE_DEBUG_AUDIO === '1') {
            console.log('[Voice Server] Creating audio stream for continuous sending');
          }
          
          // Create a PassThrough stream that we can write to continuously
          const { PassThrough } = require('stream');
          audioStream = new PassThrough();
          
          // Send the stream to OpenAI (only once)
          voiceInstance.send(audioStream).catch(error => {
            console.error('[Voice Server] Error sending stream to OpenAI:', error);
          });
          
          if (process.env.VOICE_DEBUG_AUDIO === '1') {
            console.log('[Voice Server] Audio stream connected to OpenAI');
          }
        }
        
        // Convert array back to Int16Array
        const int16Data = new Int16Array(audioData);
        
        // Convert to Buffer for OpenAI
        const buffer = Buffer.from(int16Data.buffer);
        
        // Write chunk to the continuous stream
        if (audioStream && !audioStream.destroyed) {
          audioStream.write(buffer);
          if (process.env.VOICE_DEBUG_AUDIO === '1') {
            console.log('[Voice Server] Audio chunk written to stream, size:', buffer.length);
          }
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
      // Reset responding state when user manually stops
      isResponding = false;
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
