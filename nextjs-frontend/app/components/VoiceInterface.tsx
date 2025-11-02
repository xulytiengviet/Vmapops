'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Mic, MicOff, GripVertical } from 'lucide-react';
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
    const [selectedSpeaker] = useState<string>('9BWtsMINqrJLrRacOk9x');
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
            if (dataPart.type === 'data-mapCommands' && Array.isArray(dataPart.data)) {
                mapStateRef.current.executeMapCommands(dataPart.data);
            }
        },
    });

    // Streaming TTS - speak sentences as they arrive
    useEffect(() => {
        const lastAssistantMessage = [...messages].reverse().find(msg => msg.role === 'assistant');
        if (!lastAssistantMessage || !isAudioEnabled) return;

        const textContent = extractTextContent(lastAssistantMessage);
        
        if (lastPlayedMessageIdRef.current !== lastAssistantMessage.id) {
            lastPlayedMessageIdRef.current = lastAssistantMessage.id;
            spokenTextRef.current = '';
            isSpeakingRef.current = false;
        }

        if (!textContent.trim() || textContent === spokenTextRef.current) return;

        const newText = textContent.slice(spokenTextRef.current.length);
        if (newText.trim().length < 10) return;

        const sentences = newText.match(/[^.!?\n]+[.!?]+(?:\s+|$)/g) || [];
        
        if (sentences.length > 0 && !isSpeakingRef.current) {
            const sentenceToSpeak = sentences[0]?.trim();
            if (sentenceToSpeak && sentenceToSpeak.length >= 15) {
                spokenTextRef.current += sentenceToSpeak + ' ';
                isSpeakingRef.current = true;
                
                speakText(sentenceToSpeak).then(() => {
                    isSpeakingRef.current = false;
                    if (status !== 'streaming' && status !== 'submitted') {
                        setIsProcessing(false);
                        setTimeout(() => {
                            if (!isListening && !isProcessing) {
                                startListening();
                            }
                        }, 500);
                    }
                }).catch(() => {
                    isSpeakingRef.current = false;
                    if (status !== 'streaming' && status !== 'submitted') {
                        setIsProcessing(false);
                        setTimeout(() => {
                            if (!isListening && !isProcessing) {
                                startListening();
                            }
                        }, 500);
                    }
                });
            }
        } else if (status !== 'streaming' && status !== 'submitted' && textContent.trim() && textContent !== spokenTextRef.current) {
            const remainingText = textContent.slice(spokenTextRef.current.length).trim();
            if (remainingText.length > 0 && !isSpeakingRef.current) {
                spokenTextRef.current = textContent;
                isSpeakingRef.current = true;
                
                speakText(remainingText).then(() => {
                    isSpeakingRef.current = false;
                    setIsProcessing(false);
                    setTimeout(() => {
                        if (!isListening && !isProcessing) {
                            startListening();
                        }
                    }, 500);
                }).catch(() => {
                    isSpeakingRef.current = false;
                    setIsProcessing(false);
                    setTimeout(() => {
                        if (!isListening && !isProcessing) {
                            startListening();
                        }
                    }, 500);
                });
            }
        }
    }, [messages, status, isListening, isProcessing, isAudioEnabled]);

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
                        sendMessage({ text: data.text });
                    } else {
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
            setupVAD(stream);
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

    // Auto-start listening when ready
    useEffect(() => {
        if (!userLocation) return;

        const timer = setTimeout(() => {
            if (!isListening && !isProcessing && isAudioEnabled) {
                startListening();
            }
        }, 500);
        
        return () => {
            clearTimeout(timer);
        };
    }, [userLocation, isAudioEnabled]);

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
        if (isListening) return 'Listening...';
        if (isProcessing) return 'Processing...';
        if (status === 'streaming') return 'Speaking...';
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

                {/* Toggle Audio */}
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
