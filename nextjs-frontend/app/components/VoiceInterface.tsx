'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Mic, MicOff, GripVertical, Radio } from 'lucide-react';
import { useMapState } from '@/app/hooks/useMapState';
import { useUserProfile } from '@/app/hooks/useUserProfile';

function extractTextContent(message: any): string {
    if (!message.parts || !Array.isArray(message.parts)) {
        return '';
    }
    return message.parts
        .filter((part: any) => part.type === 'text' || part.text)
        .map((part: any) => part.text || part.content || '')
        .join('');
}

export function VoiceInterface() {
    const mapState = useMapState();
    const userProfile = useUserProfile();
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const [selectedSpeaker] = useState<string>('nova'); // OpenAI TTS voice
    const [pushToTalkMode, setPushToTalkMode] = useState<boolean>(true); // Default to push-to-talk
    const dragStartPos = useRef({ x: 0, y: 0 });
    const barRef = useRef<HTMLDivElement>(null);
    
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
    const mapStateRef = useRef(mapState);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const vadAnalyzerRef = useRef<AnalyserNode | null>(null);
    const lastPlayedMessageIdRef = useRef<string | null>(null);
    const spokenTextRef = useRef<string>('');
    const isSpeakingRef = useRef(false);
    const vadActiveRef = useRef(false);

    // Keep refs in sync
    useEffect(() => {
        userLocationRef.current = userLocation;
    }, [userLocation]);
    useEffect(() => {
        mapStateRef.current = mapState;
    }, [mapState]);

    // Load push-to-talk preference
    useEffect(() => {
        try {
            const savedMode = localStorage.getItem('mapops.pushToTalk');
            if (savedMode !== null) {
                setPushToTalkMode(savedMode === 'true');
            }
        } catch {}
    }, []);

    // Save push-to-talk preference
    useEffect(() => {
        try {
            localStorage.setItem('mapops.pushToTalk', pushToTalkMode.toString());
        } catch {}
    }, [pushToTalkMode]);

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
                (err) => console.warn('[VoiceInterface] Geolocation error:', err)
            );
        }
    }, []);

    // Chat hook
    const { messages, status, sendMessage } = useChat({
        transport: new DefaultChatTransport({
            api: '/api/chat',
            prepareSendMessagesRequest({ messages }) {
                const currentLocation = userLocationRef.current;
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
                
                return {
                    body: {
                        messages,
                        context: {
                            userLocation: currentLocation,
                            mapCenter: mapState.center,
                            mapZoom: mapState.zoom,
                            mapBounds: mapState.bounds,
                            savedPlaces: Object.keys(savedPlaces).length > 0 ? savedPlaces : undefined,
                        },
                    },
                };
            },
        }),
        onData: (dataPart) => {
            console.log('[VoiceInterface] Received data part:', dataPart);
            if (dataPart.type === 'data-mapCommands' && Array.isArray(dataPart.data)) {
                const commandTypes = dataPart.data.map((cmd: any) => cmd.type);
                console.log(`[VoiceInterface] ✅ Received ${dataPart.data.length} mapCommands:`, commandTypes.join(', '));
                mapStateRef.current.executeMapCommands(dataPart.data);
            }
        },
        onError: (error) => {
            console.error('[VoiceInterface] Chat error:', error);
            setIsProcessing(false);
        },
    });

    // Track status changes to update processing state
    useEffect(() => {
        // Reset processing when chat status is no longer streaming/submitted and we have messages
        if (status !== 'streaming' && status !== 'submitted' && isProcessing) {
            const lastAssistantMessage = [...messages].reverse().find(msg => msg.role === 'assistant');
            // Only reset if we have received a response
            if (lastAssistantMessage) {
                console.log('[VoiceInterface] Chat response received, resetting processing state');
                // Don't reset immediately - let TTS finish first
                // The TTS effect will reset it when done
            }
        }
    }, [status, isProcessing, messages]);

    // Debug: Log messages array (like ChatInterface does)
    useEffect(() => {
        console.log('[VoiceInterface] Messages array updated:', messages.length);
        messages.forEach((msg, index) => {
            const textContent = extractTextContent(msg);
            console.log(`[VoiceInterface] Message ${index}:`, {
                id: msg.id,
                role: msg.role,
                textContent: textContent?.substring(0, 100) + '...',
                textContentLength: textContent?.length || 0,
            });
        });
    }, [messages]);

    // Streaming TTS - speak sentences as they arrive
    useEffect(() => {
        const lastAssistantMessage = [...messages].reverse().find(msg => msg.role === 'assistant');
        if (!lastAssistantMessage || !isAudioEnabled) {
            if (!isAudioEnabled) {
                console.log('[VoiceInterface] TTS disabled, skipping audio');
            }
            return;
        }

        const textContent = extractTextContent(lastAssistantMessage);
        console.log('[VoiceInterface] Processing assistant message for TTS:', {
            messageId: lastAssistantMessage.id,
            textLength: textContent.length,
            status,
            isSpeaking: isSpeakingRef.current,
            spokenLength: spokenTextRef.current.length,
        });
        
        if (lastPlayedMessageIdRef.current !== lastAssistantMessage.id) {
            console.log('[VoiceInterface] New message detected, resetting TTS state');
            lastPlayedMessageIdRef.current = lastAssistantMessage.id;
            spokenTextRef.current = '';
            isSpeakingRef.current = false;
        }

        if (!textContent.trim()) {
            console.log('[VoiceInterface] No text content to speak');
            return;
        }

        if (textContent === spokenTextRef.current) {
            console.log('[VoiceInterface] Already spoken this text');
            return;
        }

        const newText = textContent.slice(spokenTextRef.current.length);
        if (newText.trim().length < 10) {
            console.log('[VoiceInterface] New text too short, waiting for more');
            return;
        }

        // Simplified: speak the entire remaining text when streaming completes
        if (status !== 'streaming' && status !== 'submitted' && !isSpeakingRef.current) {
            const remainingText = textContent.slice(spokenTextRef.current.length).trim();
            if (remainingText.length > 0) {
                console.log('[VoiceInterface] Speaking remaining text:', remainingText.substring(0, 100) + '...');
                spokenTextRef.current = textContent;
                isSpeakingRef.current = true;
                
                speakText(remainingText).then(() => {
                    console.log('[VoiceInterface] ✅ Finished speaking');
                    isSpeakingRef.current = false;
                    setIsProcessing(false);
                    // Only auto-restart in always-on mode
                    if (!pushToTalkMode && !isListening && !isProcessing) {
                        setTimeout(() => {
                            startListening();
                        }, 500);
                    }
                }).catch((err) => {
                    console.error('[VoiceInterface] ❌ TTS error:', err);
                    isSpeakingRef.current = false;
                    setIsProcessing(false);
                    // Only auto-restart in always-on mode
                    if (!pushToTalkMode && !isListening && !isProcessing) {
                        setTimeout(() => {
                            startListening();
                        }, 500);
                    }
                });
            }
        } else if (status === 'streaming' || status === 'submitted') {
            // While streaming, extract sentences and speak them incrementally
            const sentences = newText.match(/[^.!?\n]+[.!?]+(?:\s+|$)/g) || [];
            if (sentences.length > 0 && !isSpeakingRef.current) {
                const sentenceToSpeak = sentences[0]?.trim();
                if (sentenceToSpeak && sentenceToSpeak.length >= 15) {
                    console.log('[VoiceInterface] Speaking sentence while streaming:', sentenceToSpeak.substring(0, 50) + '...');
                    spokenTextRef.current += sentenceToSpeak + ' ';
                    isSpeakingRef.current = true;
                    
                    speakText(sentenceToSpeak).then(() => {
                        isSpeakingRef.current = false;
                        // Continue processing if still streaming
                    }).catch((err) => {
                        console.error('[VoiceInterface] ❌ TTS error during streaming:', err);
                        isSpeakingRef.current = false;
                    });
                }
            }
        }
    }, [messages, status, isListening, isProcessing, isAudioEnabled, pushToTalkMode]);

    // VAD
    const setupVAD = (stream: MediaStream) => {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        vadAnalyzerRef.current = analyser;
        vadActiveRef.current = true;

        const checkVoiceActivity = () => {
            if (!vadAnalyzerRef.current || !vadActiveRef.current) return;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            
            if (average < 25) {
                if (!silenceTimerRef.current) {
                    silenceTimerRef.current = setTimeout(() => {
                        if (mediaRecorderRef.current?.state === 'recording' && vadActiveRef.current) {
                            stopListening();
                        }
                    }, 1500);
                }
            } else {
                if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current);
                    silenceTimerRef.current = null;
                }
            }
            
            if (vadActiveRef.current) {
                requestAnimationFrame(checkVoiceActivity);
            }
        };
        
        checkVoiceActivity();
    };

    // Start listening
    const startListening = async () => {
        if (isListening || !userLocation || !isAudioEnabled) return;
        
        try {
            setIsListening(true);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
            });

            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                setIsListening(false);
                
                if (audioChunksRef.current.length === 0) {
                    setTimeout(() => {
                        if (!isProcessing) {
                            startListening();
                        }
                    }, 500);
                    return;
                }

                setIsProcessing(true);
                stopAudio();

                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const formData = new FormData();
                formData.append('audio', audioBlob, 'recording.webm');

                try {
                    const response = await fetch('/api/voice/listen', {
                        method: 'POST',
                        body: formData,
                    });

                    const data = await response.json();
                    
                    if (data.success && data.text?.trim()) {
                        console.log('[VoiceInterface] ✅ Transcribed text:', data.text);
                        console.log('[VoiceInterface] 📤 Sending message to chat API...');
                        sendMessage({ text: data.text });
                        // Keep isProcessing true - will be reset when response completes via status tracking
                    } else {
                        console.warn('[VoiceInterface] Transcription failed or empty:', data);
                        setIsProcessing(false);
                        setTimeout(() => {
                            if (!isProcessing) {
                                startListening();
                            }
                        }, 500);
                    }
                } catch (error) {
                    console.error('[VoiceInterface] Transcription error:', error);
                    setIsProcessing(false);
                    setTimeout(() => {
                        if (!isProcessing) {
                            startListening();
                        }
                    }, 1000);
                } finally {
                    audioChunksRef.current = [];
                }
            };

            mediaRecorderRef.current = mediaRecorder;
            // Only setup VAD in always-on mode
            if (!pushToTalkMode) {
                setupVAD(stream);
            }
            mediaRecorder.start();
        } catch (error) {
            console.error('[VoiceInterface] Error starting recording:', error);
            setIsListening(false);
        }
    };

    // Stop listening
    const stopListening = () => {
        vadActiveRef.current = false;
        
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
        setIsListening(false);
    };

    // Push-to-talk handlers
    const handlePushToTalkStart = () => {
        if (!userLocation || isProcessing || isListening) return;
        console.log('[VoiceInterface] Push-to-talk: Starting recording');
        startListening();
    };

    const handlePushToTalkStop = () => {
        if (isListening) {
            console.log('[VoiceInterface] Push-to-talk: Stopping recording');
            stopListening();
        }
    };

    // Speak text
    const speakText = async (text: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            const plain = text
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/\*([^*]+)\*/g, '$1')
                .replace(/`([^`]+)`/g, '$1')
                .replace(/^#+\s+/gm, '')
                .trim();
            
            let textForSpeech = plain;
            if (plain.length > 500) {
                const firstSentence = plain.match(/^[^.!?\n]+[.!?]+/)?.[0] || plain.slice(0, 200);
                textForSpeech = firstSentence + ' Check the map for details.';
            }
            
            fetch('/api/voice/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: textForSpeech, speaker: selectedSpeaker }),
            })
            .then(response => {
                if (!response.ok) throw new Error('TTS failed');
                return response.blob();
            })
            .then(audioBlob => {
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);
                
                if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.src = '';
                }
                
                audioRef.current = audio;
                audio.play().catch(reject);
                
                audio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    if (audioRef.current === audio) {
                        audioRef.current = null;
                    }
                    resolve();
                };
                
                audio.onerror = () => {
                    URL.revokeObjectURL(audioUrl);
                    reject();
                };
            })
            .catch(reject);
        });
    };

    // Stop audio
    const stopAudio = () => {
        if (audioRef.current) {
            try {
                audioRef.current.pause();
                audioRef.current.src = '';
            } catch {}
            audioRef.current = null;
        }
    };

    // Auto-start listening when ready (only in always-on mode)
    useEffect(() => {
        if (!userLocation || pushToTalkMode) return;

        const timer = setTimeout(() => {
            if (!isListening && !isProcessing && isAudioEnabled) {
                startListening();
            }
        }, 500);
        
        return () => {
            clearTimeout(timer);
        };
    }, [userLocation, isAudioEnabled, pushToTalkMode]);

    // Drag handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!barRef.current) return;
        setIsDragging(true);
        const rect = barRef.current.getBoundingClientRect();
        // Store the offset from mouse click to element's top-left corner
        dragStartPos.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!barRef.current) return;
            
            // Calculate new position: mouse position minus the offset
            const newX = e.clientX - dragStartPos.current.x;
            const newY = e.clientY - dragStartPos.current.y;
            
            // Constrain to viewport
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
        document.body.style.userSelect = 'none'; // Prevent text selection while dragging

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
        };
    }, [isDragging]);

    // Get status text
    const getStatusText = () => {
        if (isSpeakingRef.current) return 'Speaking...';
        if (status === 'streaming' || status === 'submitted') return 'Processing...';
        if (isListening) return 'Listening...';
        if (isProcessing) return 'Processing...';
        if (!userLocation) return 'Waiting for location...';
        return 'Ready';
    };

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
            {/* Grey Glassmorphic Control Bar */}
            <div className="bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl px-6 py-3 flex items-center gap-4 pointer-events-auto">
                {/* Move Handle */}
                <button
                    onMouseDown={handleMouseDown}
                    className="text-white/70 hover:text-white transition-colors cursor-move active:cursor-grabbing"
                    title="Move voice assistant"
                >
                    <GripVertical size={18} />
                </button>

                {/* Status/Dashboard */}
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-700/50 rounded-lg border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white text-sm font-medium">{getStatusText()}</span>
                </div>

                {/* Push-to-Talk Button (when in push-to-talk mode) */}
                {pushToTalkMode ? (
                    <button
                        onMouseDown={handlePushToTalkStart}
                        onMouseUp={handlePushToTalkStop}
                        onTouchStart={(e) => {
                            e.preventDefault();
                            handlePushToTalkStart();
                        }}
                        onTouchEnd={(e) => {
                            e.preventDefault();
                            handlePushToTalkStop();
                        }}
                        disabled={isProcessing || !userLocation}
                        className={`px-6 py-3 rounded-lg border transition-all font-medium ${
                            isListening
                                ? 'bg-red-600/80 border-red-400/50 text-white shadow-lg scale-105'
                                : isProcessing || !userLocation
                                ? 'bg-gray-700/30 border-white/5 text-white/30 cursor-not-allowed'
                                : 'bg-blue-600/80 border-blue-400/50 text-white hover:bg-blue-600 shadow-md hover:shadow-lg active:scale-95'
                        }`}
                        title={isListening ? "Release to send" : "Hold to speak"}
                    >
                        {isListening ? (
                            <span className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                Recording...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Mic size={18} />
                                Hold to Speak
                            </span>
                        )}
                    </button>
                ) : (
                    /* Toggle Audio (always-on mode) */
                    <button
                        onClick={() => {
                            setIsAudioEnabled(!isAudioEnabled);
                            if (!isAudioEnabled) {
                                stopAudio();
                            }
                        }}
                        className={`px-4 py-2 rounded-lg border transition-all ${
                            isAudioEnabled 
                                ? 'bg-gray-700/50 border-white/10 text-white' 
                                : 'bg-gray-900/50 border-white/5 text-white/50'
                        }`}
                        title="Toggle audio"
                    >
                        {isAudioEnabled ? (
                            <Mic size={18} className="text-white" />
                        ) : (
                            <MicOff size={18} className="text-white/50" />
                        )}
                    </button>
                )}

                {/* Toggle Mode */}
                <button
                    onClick={() => {
                        setPushToTalkMode(!pushToTalkMode);
                        stopListening();
                        setIsProcessing(false);
                    }}
                    className={`px-3 py-2 rounded-lg border transition-all ${
                        pushToTalkMode 
                            ? 'bg-blue-600/50 border-blue-400/30 text-white' 
                            : 'bg-gray-700/50 border-white/10 text-white'
                    }`}
                    title={pushToTalkMode ? "Switch to always-on mode" : "Switch to push-to-talk mode"}
                >
                    <Radio size={16} />
                </button>

                {/* End Session */}
                <button
                    onClick={() => {
                        stopListening();
                        stopAudio();
                        setIsProcessing(false);
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
