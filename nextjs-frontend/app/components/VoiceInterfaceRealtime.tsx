'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, GripVertical } from 'lucide-react';
import { useMapState } from '@/app/hooks/useMapState';
import { useUserProfile } from '@/app/hooks/useUserProfile';
import { io, Socket } from 'socket.io-client';

export function VoiceInterfaceRealtime() {
    // Playback configuration
    const PLAYBACK_SAMPLE_RATE = 24000; // OpenAI realtime audio
    const INITIAL_JITTER_BUFFER_MS = 180; // startup buffer to smooth scheduling
    const MIN_HEADROOM_MS = 30; // when catching up, keep at least this headroom
    const mapState = useMapState();
    const userProfile = useUserProfile();
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
    const [status, setStatus] = useState<string>('Waiting for location...');
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const barRef = useRef<HTMLDivElement>(null);
    
    const socketRef = useRef<Socket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const playbackContextRef = useRef<AudioContext | null>(null);
    const nextPlayTimeRef = useRef<number>(0);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);

    // Get user location
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    });
                },
                (err) => console.warn('[VoiceInterfaceRealtime] Geolocation error:', err)
            );
        }
    }, []);

    // Initialize Socket.IO connection
    useEffect(() => {
        if (!userLocation) return;

        console.log('[VoiceInterfaceRealtime] Initializing Socket.IO connection...');
        
        // Initialize socket connection to custom server
        const socket = io({
            transports: ['websocket', 'polling'],
        });

        socketRef.current = socket;

        // Socket event handlers
        socket.on('connect', () => {
            console.log('[VoiceInterfaceRealtime] Socket connected:', socket.id);
            setIsConnected(true);
            setStatus('Initializing voice...');

            // Send initialization data
            const savedPlaces: Record<string, { location: { lat: number; lng: number }; name: string; address: string }> = {};
            if (userProfile.home) {
                savedPlaces.home = {
                    location: userProfile.home.location,
                    name: userProfile.home.name,
                    address: userProfile.home.address,
                };
            }
            if (userProfile.work) {
                savedPlaces.work = {
                    location: userProfile.work.location,
                    name: userProfile.work.name,
                    address: userProfile.work.address,
                };
            }
            userProfile.favorites.forEach(fav => {
                savedPlaces[fav.name.toLowerCase()] = {
                    location: fav.location,
                    name: fav.name,
                    address: fav.address,
                };
            });

            socket.emit('init', {
                userLocation,
                mapState: {
                    center: mapState.center,
                    zoom: mapState.zoom,
                    bounds: mapState.bounds,
                },
                savedPlaces: Object.keys(savedPlaces).length > 0 ? savedPlaces : undefined,
            });
        });

        socket.on('ready', ({ message }) => {
            console.log('[VoiceInterfaceRealtime] Voice ready:', message);
            setStatus('Ready - Click to start');
        });

        socket.on('status', (newStatus: string) => {
            console.log('[VoiceInterfaceRealtime] Status update:', newStatus);
            setStatus(newStatus);
            // Track if assistant is speaking to block audio input
            setIsAssistantSpeaking(newStatus === 'speaking');
        });

        socket.on('audio', (audioData: ArrayBuffer | number[]) => {
            // Handle both binary ArrayBuffer and JSON number[] payloads
            let int16Data: Int16Array;
            if (audioData instanceof ArrayBuffer) {
                int16Data = new Int16Array(audioData);
            } else {
                int16Data = new Int16Array(audioData);
            }
            if ((window as any).VOICE_DEBUG_AUDIO) {
                console.log('[VoiceInterfaceRealtime] Received audio chunk, length:', int16Data.length);
            }
            playAudioChunk(int16Data);
        });

        socket.on('mapCommands', (commands: any[]) => {
            console.log('[VoiceInterfaceRealtime] Received map commands:', commands);
            mapState.executeMapCommands(commands);
        });

        socket.on('error', ({ message }) => {
            console.error('[VoiceInterfaceRealtime] Error:', message);
            setStatus(`Error: ${message}`);
        });

        socket.on('disconnect', () => {
            console.log('[VoiceInterfaceRealtime] Socket disconnected');
            setIsConnected(false);
            setStatus('Disconnected');
            stopListening();
        });

        return () => {
            console.log('[VoiceInterfaceRealtime] Cleaning up socket connection');
            socket.disconnect();
            stopListening();
        };
    }, [userLocation]);

    // Start listening to microphone
    const startListening = async () => {
        if (isListening || !socketRef.current?.connected) return;

        try {
            console.log('[VoiceInterfaceRealtime] Starting microphone...');
            setIsListening(true);
            setStatus('Listening...');

            // Get microphone access (let browser choose optimal settings)
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            mediaStreamRef.current = stream;

            // Get the actual sample rate from the stream
            const track = stream.getAudioTracks()[0];
            const settings = track.getSettings();
            const actualSampleRate = settings.sampleRate || 48000;
            
            console.log('[VoiceInterfaceRealtime] Microphone sample rate:', actualSampleRate);

            // Create audio context with the SAME sample rate as the stream
            const audioContext = new AudioContext({ sampleRate: actualSampleRate });
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);
            // Dynamically register a lightweight AudioWorklet to convert Float32 → Int16
            const workletCode = `
class MicProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      const len = ch.length;
      const int16 = new Int16Array(len);
      for (let i = 0; i < len; i++) {
        const s = Math.max(-1, Math.min(1, ch[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(int16, [int16.buffer]);
    }
    return true;
  }
}
registerProcessor('mic-processor', MicProcessor);
`;
            const blobUrl = URL.createObjectURL(new Blob([workletCode], { type: 'application/javascript' }));
            await audioContext.audioWorklet.addModule(blobUrl);

            const micNode = new AudioWorkletNode(audioContext, 'mic-processor', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                channelCount: 1,
            });
            workletNodeRef.current = micNode;

            // Pipe chunks from the worklet to the server
            micNode.port.onmessage = (event) => {
                if (!socketRef.current?.connected) return;
                // BLOCK audio if assistant is speaking (prevent feedback loop)
                if (isAssistantSpeaking) return;
                
                const data = event.data as ArrayBuffer | Int16Array;
                const int16Data = data instanceof ArrayBuffer ? new Int16Array(data) : (data as Int16Array);
                const audioArray = Array.from(int16Data);
                if (!(window as any).audioChunkCount) (window as any).audioChunkCount = 0;
                if ((window as any).audioChunkCount++ < 1) {
                    console.log('[VoiceInterfaceRealtime] Sending audio chunks...');
                }
                socketRef.current.emit('audio', audioArray);
            };

            // Create a silent gain node to keep graph alive but avoid loopback
            const silentGain = audioContext.createGain();
            silentGain.gain.value = 0;

            source.connect(micNode);
            micNode.connect(silentGain);
            silentGain.connect(audioContext.destination);

            console.log('[VoiceInterfaceRealtime] Microphone started, streaming audio');
        } catch (error) {
            console.error('[VoiceInterfaceRealtime] Error starting microphone:', error);
            setStatus('Microphone error');
            setIsListening(false);
        }
    };

    // Stop listening
    const stopListening = () => {
        console.log('[VoiceInterfaceRealtime] Stopping microphone...');
        
        // Tell server to end the audio stream
        if (socketRef.current?.connected) {
            socketRef.current.emit('stop-audio');
        }
        
        if (workletNodeRef.current) {
            workletNodeRef.current.disconnect();
            workletNodeRef.current.port.onmessage = null as unknown as (this: MessagePort, ev: MessageEvent) => any;
            workletNodeRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }

        setIsListening(false);
        if (isConnected) {
            setStatus('Ready - Click to start');
        }
        
        // Reset audio chunk counter
        (window as any).audioChunkCount = 0;
        
        // Reset playback queue
        nextPlayTimeRef.current = 0;
    };

    // Play audio chunk with proper queuing and timing
    const playAudioChunk = async (audioData: Int16Array) => {
        try {
            // Create separate AudioContext for playback (24kHz for OpenAI audio)
            if (!playbackContextRef.current) {
                playbackContextRef.current = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
                nextPlayTimeRef.current = 0;
            }

            const audioContext = playbackContextRef.current;
            
            // Resume audio context if suspended (required by browsers)
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
                console.log('[VoiceInterfaceRealtime] Playback context resumed');
            }

            // Create audio buffer
            const audioBuffer = audioContext.createBuffer(1, audioData.length, PLAYBACK_SAMPLE_RATE);
            const channelData = audioBuffer.getChannelData(0);

            // Convert Int16Array to Float32Array
            for (let i = 0; i < audioData.length; i++) {
                channelData[i] = audioData[i] / (audioData[i] < 0 ? 0x8000 : 0x7fff);
            }

            // Calculate when to schedule this chunk
            const currentTime = audioContext.currentTime;
            const duration = audioData.length / PLAYBACK_SAMPLE_RATE;
            
            // Initialize nextPlayTime if this is the first chunk
            if (nextPlayTimeRef.current === 0) {
                // Start with jitter buffer to absorb network variability
                nextPlayTimeRef.current = currentTime + INITIAL_JITTER_BUFFER_MS / 1000;
            }
            
            // If nextPlayTime is in the past, schedule slightly ahead of current time
            if (nextPlayTimeRef.current < currentTime) {
                // Add minimal headroom to prevent overlap/glitches when catching up
                nextPlayTimeRef.current = currentTime + MIN_HEADROOM_MS / 1000;
            }

            // Create and schedule the audio source
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            
            // Schedule to play at the queued time
            const scheduleTime = nextPlayTimeRef.current;
            source.start(scheduleTime);
            
            // Update next play time for the next chunk
            nextPlayTimeRef.current = scheduleTime + duration;
            
            if ((window as any).VOICE_DEBUG_AUDIO) {
            console.log('[VoiceInterfaceRealtime] Scheduled chunk at', scheduleTime.toFixed(3), 's, duration:', duration.toFixed(3), 's');
            }
        } catch (error) {
            console.error('[VoiceInterfaceRealtime] Error playing audio:', error);
        }
    };

    // Toggle listening
    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    // Drag handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!barRef.current) return;
        setIsDragging(true);
        const rect = barRef.current.getBoundingClientRect();
        dragStartPos.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!barRef.current) return;
            
            const newX = e.clientX - dragStartPos.current.x;
            const newY = e.clientY - dragStartPos.current.y;
            
            const maxX = window.innerWidth - barRef.current.offsetWidth;
            const maxY = window.innerHeight - barRef.current.offsetHeight;
            
            setPosition({
                x: Math.max(0, Math.min(newX, maxX)),
                y: Math.max(0, Math.min(newY, maxY)),
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = 'none';

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
        };
    }, [isDragging]);

    return (
        <div 
            ref={barRef}
            className="fixed z-50 pointer-events-none"
            style={{
                ...(position 
                    ? { left: `${position.x}px`, top: `${position.y}px` }
                    : { left: '50%', bottom: '24px', transform: 'translateX(-50%)' }
                ),
            }}
        >
            {/* Voice Control Bar */}
            <div className="bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl px-6 py-3 flex items-center gap-4 pointer-events-auto">
                {/* Move Handle */}
                <button
                    onMouseDown={handleMouseDown}
                    className="text-white/70 hover:text-white transition-colors cursor-move active:cursor-grabbing"
                    title="Move voice assistant"
                >
                    <GripVertical size={18} />
                </button>

                {/* Status Display - Clickable when ready */}
                <button
                    onClick={() => {
                        if (status === 'Ready - Click to start' && !isListening && isConnected) {
                            startListening();
                        }
                    }}
                    disabled={status !== 'Ready - Click to start' || isListening || !isConnected}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                        status === 'Ready - Click to start' && !isListening && isConnected
                            ? 'bg-gray-700/50 border-white/10 text-white hover:bg-gray-700/70 cursor-pointer'
                            : 'bg-gray-700/50 border-white/5 text-white cursor-default'
                    }`}
                    title={status === 'Ready - Click to start' && !isListening ? 'Click to start listening' : status}
                >
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} ${isListening ? 'animate-pulse' : ''}`} />
                    <span className="text-sm font-medium">{status}</span>
                </button>

                {/* Voice Toggle */}
                <button
                    onClick={toggleListening}
                    disabled={!isConnected}
                    className={`px-4 py-2 rounded-lg border transition-all ${
                        isListening
                            ? 'bg-red-600/70 border-red-500/50 text-white' 
                            : isConnected
                            ? 'bg-gray-700/50 border-white/10 text-white hover:bg-gray-700/70'
                            : 'bg-gray-900/50 border-white/5 text-white/50 cursor-not-allowed'
                    }`}
                    title={isListening ? 'Stop listening' : 'Start listening'}
                >
                    {isListening ? (
                        <MicOff size={18} />
                    ) : (
                        <Mic size={18} />
                    )}
                </button>

                {/* End Session */}
                <button
                    onClick={() => {
                        stopListening();
                        if (socketRef.current) {
                            socketRef.current.disconnect();
                        }
                    }}
                    className="px-4 py-2 rounded-lg bg-gray-700/50 border border-white/10 text-white hover:bg-gray-700/70 transition-colors flex items-center gap-2"
                    title="End session"
                >
                    <div className="w-2 h-2 rounded-full bg-white" />
                    <span className="text-sm">End</span>
                </button>
            </div>
        </div>
    );
}
