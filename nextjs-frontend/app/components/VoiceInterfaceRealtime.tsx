'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, GripVertical } from 'lucide-react';
import { useMapState } from '@/app/hooks/useMapState';
import { useUserProfile } from '@/app/hooks/useUserProfile';
import { io, Socket } from 'socket.io-client';

export function VoiceInterfaceRealtime() {
    const mapState = useMapState();
    const userProfile = useUserProfile();
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [status, setStatus] = useState<string>('Waiting for location...');
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const barRef = useRef<HTMLDivElement>(null);
    
    const socketRef = useRef<Socket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);

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
        });

        socket.on('audio', (audioData: Int16Array) => {
            // Play received audio
            playAudioChunk(audioData);
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
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (!socketRef.current?.connected) return;

                const inputData = e.inputBuffer.getChannelData(0);
                // Convert Float32Array to Int16Array (PCM format)
                const int16Data = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
                }

                // Send audio to server
                socketRef.current.emit('audio', int16Data);
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

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
        
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
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
    };

    // Play audio chunk
    const playAudioChunk = (audioData: Int16Array) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        }

        const audioContext = audioContextRef.current;
        const audioBuffer = audioContext.createBuffer(1, audioData.length, 24000);
        const channelData = audioBuffer.getChannelData(0);

        // Convert Int16Array to Float32Array
        for (let i = 0; i < audioData.length; i++) {
            channelData[i] = audioData[i] / (audioData[i] < 0 ? 0x8000 : 0x7fff);
        }

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
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
