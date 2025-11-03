'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMapState } from '@/app/hooks/useMapState';
import { useUserProfile } from '@/app/hooks/useUserProfile';

interface ChatInterfaceProps {
    onPlaceSelect?: (place: any) => void;
}

// Helper function to extract text content from message parts
function extractTextContent(message: any): string {
    if (!message.parts || !Array.isArray(message.parts)) {
        return '';
    }

    // Look for text parts in the message
    const textParts = message.parts
        .filter((part: any) => part.type === 'text' || part.text)
        .map((part: any) => part.text || part.content || '')
        .join('');

    return textParts;
}

export function ChatInterface({ onPlaceSelect: _ }: ChatInterfaceProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mapState = useMapState();
    const userProfile = useUserProfile();
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [replyMode, setReplyMode] = useState<'text' | 'voice' | 'auto' | 'hands-free'>('text');
    const [isHandsFreeActive, setIsHandsFreeActive] = useState(false);
    const [speakStyle, setSpeakStyle] = useState<'summary' | 'full'>('summary');
    const [selectedSpeaker, setSelectedSpeaker] = useState<string>('9BWtsMINqrJLrRacOk9x'); // Default: Aria
    const [lastUserInputWasVoice, setLastUserInputWasVoice] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    
    // Use ref to avoid closure issues with userLocation
    const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
    
    // Keep ref in sync with state
    useEffect(() => {
        userLocationRef.current = userLocation;
        console.log('[ChatInterface] userLocation state changed:', userLocation);
    }, [userLocation]);

    // Get user's geolocation on mount
    useEffect(() => {
        if (navigator.geolocation) {
            console.log('[ChatInterface] Requesting geolocation...');
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const location = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    };
                    console.log('[ChatInterface] Geolocation acquired:', location);
                    setUserLocation(location);
                },
                (err) => {
                    console.warn('[ChatInterface] Geolocation error:', err);
                }
            );
        } else {
            console.warn('[ChatInterface] Geolocation not supported by browser');
        }
    }, []);

    // Use ref for mapState to avoid recreating handlers on every state change
    const mapStateRef = useRef(mapState);
    useEffect(() => {
        mapStateRef.current = mapState;
    }, [mapState]);

    // Load persisted voice prefs and speakers on mount
    useEffect(() => {
        try {
            const savedMode = localStorage.getItem('mapops.replyMode');
            const savedSpeaker = localStorage.getItem('mapops.speaker');
            const savedSpeakStyle = localStorage.getItem('mapops.speakStyle');
            if (savedMode === 'text' || savedMode === 'voice' || savedMode === 'auto') setReplyMode(savedMode);
            if (savedSpeaker) setSelectedSpeaker(savedSpeaker);
            if (savedSpeakStyle === 'summary' || savedSpeakStyle === 'full') setSpeakStyle(savedSpeakStyle);
        } catch {}

    }, []);

    // Persist changes
    useEffect(() => {
        try { localStorage.setItem('mapops.replyMode', replyMode); } catch {}
    }, [replyMode]);
    useEffect(() => {
        try { localStorage.setItem('mapops.speaker', selectedSpeaker); } catch {}
    }, [selectedSpeaker]);
    useEffect(() => {
        try { localStorage.setItem('mapops.speakStyle', speakStyle); } catch {}
    }, [speakStyle]);

    // Track streaming text for real-time TTS
    const streamingAssistantTextRef = useRef<string>('');
    const ttsQueueRef = useRef<string[]>([]);
    const isPlayingRef = useRef(false);
    const lastTtsTimeRef = useRef<number>(0);
    const lastPlayedMessageIdRef = useRef<string | null>(null);

    // Use the AI SDK's useChat hook with DefaultChatTransport as per Mastra docs
    const { messages, status, error, sendMessage } = useChat({
        transport: new DefaultChatTransport({
            api: '/api/chat',
            prepareSendMessagesRequest({ messages }) {
                // Use ref to get current location value (avoids closure issues)
                const currentLocation = userLocationRef.current;
                
                // Prepare saved places for context (only send necessary data)
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
                // Add favorites
                userProfile.favorites.forEach(fav => {
                    savedPlaces[fav.name.toLowerCase()] = {
                        location: fav.location,
                        name: fav.name,
                        address: fav.address,
                    };
                });
                
                const context = {
                    userLocation: currentLocation,
                    mapCenter: mapState.center,
                    mapZoom: mapState.zoom,
                    mapBounds: mapState.bounds,
                    savedPlaces: Object.keys(savedPlaces).length > 0 ? savedPlaces : undefined,
                };
                
                // Debug log to see what's being sent
                console.log('[ChatInterface] Sending context to API:', {
                    ...context,
                    locationFromState: userLocation,  // Compare with state value
                    locationFromRef: currentLocation,  // This is what's actually sent
                });
                
                // Pass context data with each message request
                return {
                    body: {
                        messages,
                        context,
                    },
                };
            },
        }),
        onError: (error) => {
            console.error('[ChatInterface] Chat error:', error);
        },
        onData: (dataPart) => {
            // Handle custom data parts from AI SDK stream (AI SDK v5 way)
            console.log('[ChatInterface] Received data part:', dataPart);
            
            if (dataPart.type === 'data-mapCommands' && Array.isArray(dataPart.data)) {
                const commandTypes = dataPart.data.map((cmd: any) => cmd.type);
                console.log(`[ChatInterface] ✅ Received ${dataPart.data.length} mapCommands from data part:`, commandTypes.join(', '));
                console.log('[ChatInterface] Full commands:', dataPart.data);
                // Use ref to get latest mapState without dependency
                mapStateRef.current.executeMapCommands(dataPart.data);
            }
        },
    });

    // Debug: Log messages array
    useEffect(() => {
        console.log('[ChatInterface] Messages array updated:', messages);
        messages.forEach((msg, index) => {
            const textContent = extractTextContent(msg);
            console.log(`[ChatInterface] Message ${index}:`, {
                id: msg.id,
                role: msg.role,
                textContent,
                textContentLength: textContent?.length || 0,
                hasParts: !!msg.parts,
                partsCount: msg.parts?.length || 0
            });
        });
    }, [messages]);

    // Real-time streaming TTS: speak as text chunks arrive by tracking message updates
    useEffect(() => {
        const shouldPlayAudio = replyMode === 'voice' || replyMode === 'hands-free' || (replyMode === 'auto' && lastUserInputWasVoice);
        if (!shouldPlayAudio) return;

        const lastAssistantMessage = [...messages].reverse().find(msg => msg.role === 'assistant');
        if (!lastAssistantMessage) return;

        const textContent = extractTextContent(lastAssistantMessage);
        
        // Reset on new message
        if (lastAssistantMessage.id !== lastPlayedMessageIdRef.current) {
            lastPlayedMessageIdRef.current = lastAssistantMessage.id;
            streamingAssistantTextRef.current = '';
            ttsQueueRef.current = [];
            isPlayingRef.current = false;
            lastTtsTimeRef.current = 0;
        }

        // Track text changes for streaming
        if (textContent && textContent !== streamingAssistantTextRef.current) {
            const newText = textContent.slice(streamingAssistantTextRef.current.length);
            streamingAssistantTextRef.current = textContent;

            // If streaming, speak incrementally
            if (status === 'streaming' || status === 'submitted') {
                // Extract complete sentences from new text (improved regex)
                // Match sentences ending with . ! ? followed by space or newline
                const sentences = newText.match(/[^.!?\n]+[.!?]+(?:\s+|$)/g) || [];
                
                // Filter out very short fragments (likely incomplete sentences)
                const validSentences = sentences.filter(s => {
                    const cleaned = s.trim();
                    return cleaned.length >= 15 && // At least 15 chars
                           cleaned.match(/[.!?]$/); // Ends with punctuation
                });
                
                if (validSentences.length > 0) {
                    ttsQueueRef.current.push(...validSentences);
                    processTtsQueue();
                }
            } else {
                // Streaming complete - speak any remaining text
                if (textContent.trim() && !isPlayingRef.current && ttsQueueRef.current.length === 0) {
                    const remaining = textContent.slice(streamingAssistantTextRef.current.length);
                    if (remaining.trim() || !streamingAssistantTextRef.current) {
                        // Apply summary for voice - don't read everything verbatim
                        playAudioResponse(textContent, true).then(() => {
                            if (replyMode === 'hands-free' && !isHandsFreeActive) {
                                setTimeout(() => setIsHandsFreeActive(true), 500);
                            }
                        }).catch(() => {
                            if (replyMode === 'hands-free' && !isHandsFreeActive) {
                                setTimeout(() => setIsHandsFreeActive(true), 500);
                            }
                        });
                    }
                }
            }
        }
    }, [messages, status, replyMode, lastUserInputWasVoice, isHandsFreeActive, speakStyle, selectedSpeaker]);

    // Process TTS queue for streaming chunks
    const processTtsQueue = async () => {
        const now = Date.now();
        // Throttle: wait at least 1.5s between chunks for better flow
        if (now - lastTtsTimeRef.current < 1500 || isPlayingRef.current) {
            setTimeout(() => {
                if (ttsQueueRef.current.length > 0) {
                    processTtsQueue();
                }
            }, 600);
            return;
        }

        if (ttsQueueRef.current.length === 0) return;

        const sentence = ttsQueueRef.current.shift();
        if (!sentence) return;
        
        const cleaned = sentence.trim();
        
        // Only speak meaningful sentences (at least 20 chars, ends with punctuation)
        if (cleaned.length < 20 || !cleaned.match(/[.!?]$/)) {
            // Too short or incomplete - wait for more
            setTimeout(() => {
                if (ttsQueueRef.current.length > 0) {
                    processTtsQueue();
                }
            }, 400);
            return;
        }

        isPlayingRef.current = true;
        lastTtsTimeRef.current = now;

        try {
            // Apply summary style to streaming chunks for better voice experience
            // Strip markdown and limit length for natural speech
            const textForSpeech = prepareSpeechText(cleaned, speakStyle);
            await playQuickTts(textForSpeech);
        } catch (err) {
            console.error('[ChatInterface] Streaming TTS error:', err);
        } finally {
            isPlayingRef.current = false;
            // Process next chunk with delay for natural pacing
            if (ttsQueueRef.current.length > 0) {
                setTimeout(processTtsQueue, 300);
            }
        }
    };

    // Quick TTS for streaming chunks
    const playQuickTts = async (text: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            fetch('/api/voice/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, speaker: selectedSpeaker }),
            })
            .then(response => {
                if (!response.ok) throw new Error('TTS failed');
                return response.blob();
            })
            .then(audioBlob => {
                const url = URL.createObjectURL(audioBlob);
                const audio = new Audio(url);
                
                if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.src = '';
                }
                
                audioRef.current = audio;
                audio.play().then(() => {
                    audio.onended = () => {
                        URL.revokeObjectURL(url);
                        if (audioRef.current === audio) {
                            audioRef.current = null;
                        }
                        resolve();
                    };
                    audio.onerror = () => {
                        URL.revokeObjectURL(url);
                        reject();
                    };
                }).catch(reject);
            })
            .catch(reject);
        });
    };


    // Play audio response (full message, not streaming)
    const playAudioResponse = async (text: string, isComplete: boolean = false): Promise<void> => {
        return new Promise((resolve, reject) => {
            try {
                const textForSpeech = prepareSpeechText(text, speakStyle);
                
                // Play immediate acknowledgment if hands-free mode and agent is processing
                if (!isComplete && replyMode === 'hands-free' && status === 'streaming') {
                    playQuickAck().catch(() => {});
                }
                
                fetch('/api/voice/speak', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: textForSpeech, speaker: selectedSpeaker }),
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to generate speech');
                    }
                    return response.blob();
                })
                .then(audioBlob => {
                    const audioUrl = URL.createObjectURL(audioBlob);

                    // Stop any currently playing audio
                    if (audioRef.current) {
                        audioRef.current.pause();
                        audioRef.current.src = '';
                    }

                    // Create new audio element and play
                    const audio = new Audio(audioUrl);
                    audioRef.current = audio;
                    
                    audio.play().catch(err => {
                        console.error('[ChatInterface] Audio play error:', err);
                        reject(err);
                    });

                    // Cleanup after playback
                    audio.onended = () => {
                        URL.revokeObjectURL(audioUrl);
                        if (audioRef.current === audio) {
                            audioRef.current = null;
                        }
                        resolve();
                    };

                    audio.onerror = (err) => {
                        console.error('[ChatInterface] Audio playback error:', err);
                        URL.revokeObjectURL(audioUrl);
                        if (audioRef.current === audio) {
                            audioRef.current = null;
                        }
                        reject(err);
                    };
                })
                .catch(error => {
                    console.error('[ChatInterface] Failed to play audio response:', error);
                    reject(error);
                });
            } catch (error) {
                console.error('[ChatInterface] Failed to play audio response:', error);
                reject(error);
            }
        });
    };

    // Play quick acknowledgment while processing
    const playQuickAck = async (): Promise<void> => {
        const acks = [
            "Got it, let me check that for you.",
            "Okay, looking that up.",
            "Sure thing, one moment.",
            "On it.",
        ];
        const ack = acks[Math.floor(Math.random() * acks.length)];
        
        try {
            const response = await fetch('/api/voice/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: ack, speaker: selectedSpeaker }),
            });
            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                audio.play().catch(() => {});
                audio.onended = () => URL.revokeObjectURL(url);
            }
        } catch (err) {
            // Ignore errors for acknowledgments
        }
    };



    // Prepare text for speech depending on style - make it more conversational
    function prepareSpeechText(input: string, style: 'summary' | 'full'): string {
        const plain = stripMarkdown(input).trim();
        
        if (style === 'full') {
            // Even in full mode, limit very long responses
            if (plain.length > 800) {
                // Find a natural break point
                const lastPeriod = plain.slice(0, 800).lastIndexOf('.');
                if (lastPeriod > 500) {
                    return plain.slice(0, lastPeriod + 1);
                }
            }
            return plain;
        }
        
        // Summary mode: extract key info and make it conversational
        const lines = plain.split('\n').filter(line => line.trim());
        
        // Extract first paragraph or main message
        let summary = lines[0] || plain;
        
        // For very long responses (like transit routes), create a smart summary
        if (plain.length > 500) {
            // Find the first sentence (usually the main message)
            const firstSentenceMatch = plain.match(/^[^.!?\n]+[.!?]+/);
            if (firstSentenceMatch) {
                summary = firstSentenceMatch[0];
            }
            
            // If it contains route information, summarize it
            if (plain.match(/Route|transit|bus|subway/i)) {
                const routeCount = (plain.match(/Option \d+|Route/g) || []).length;
                if (routeCount > 1) {
                    summary += ` I found ${routeCount} transit options. The recommended route is shown on the map.`;
                } else {
                    summary += ' Details are on the map.';
                }
            } else if (plain.match(/places|found|results/i)) {
                // For place searches
                const placeCount = (plain.match(/\*\*/g) || []).length / 2;
                if (placeCount > 0) {
                    summary += ` I found ${placeCount} places. Check the map for details.`;
                }
            }
        } else {
            // For shorter responses, use existing logic
            // If it's a list, take first 2-3 items and summarize
            if (lines.length > 3 && lines.some(l => l.match(/^\d+\.|^[-*•]/))) {
                const listItems = lines.filter(l => l.match(/^\d+\.|^[-*•]/)).slice(0, 2);
                const intro = lines.find(l => !l.match(/^\d+\.|^[-*•]/) && l.length > 20) || summary;
                summary = intro + ' Here are the top options: ' + listItems.map(item => 
                    item.replace(/^\d+\.\s*|^[-*•]\s*/, '').replace(/\*\*/g, '').slice(0, 60)
                ).join(', and ') + '.';
            }
        }
        
        // Limit length for natural speech (8-12 seconds ≈ 150-200 words)
        if (summary.length > 400) {
            // Find a natural break point
            const lastPeriod = summary.slice(0, 400).lastIndexOf('.');
            const lastComma = summary.slice(0, 400).lastIndexOf(',');
            const breakPoint = Math.max(lastPeriod, lastComma);
            if (breakPoint > 200) {
                summary = summary.slice(0, breakPoint + 1);
            } else {
                summary = summary.slice(0, 380) + '…';
            }
        }
        
        return summary;
    }

    function stripMarkdown(md: string): string {
        // lightweight markdown stripper for voice
        return md
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/^#+\s+/gm, '')
            .replace(/^[-*]\s+/gm, '• ')
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    }

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
        }
    }, [inputValue]);

    // Handle form submission
    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const isLoading = status === 'streaming' || status === 'submitted';
        if (!inputValue.trim() || isLoading) return;

        // Track if this was typed input (not voice)
        setLastUserInputWasVoice(false);

        // Send message using AI SDK's sendMessage
        sendMessage({ text: inputValue });
        setInputValue('');
        
        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = '48px';
        }
    };

    return (
        <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 via-white to-gray-50 overflow-hidden">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full -mt-20">
                            <div className="text-center space-y-3">
                                <div className="text-4xl mb-2">🗺️</div>
                                <h2 className="text-xl font-semibold text-gray-800">Welcome to MapOps</h2>
                                <p className="text-gray-500 text-sm max-w-sm">Ask me about places, directions, or plan your perfect day out.</p>
                            </div>
                        </div>
                    )}

                    {messages.map((message) => {
                        // Extract text content from parts
                        const textContent = extractTextContent(message);
                        
                        // Extract tool calls from parts
                        const toolCalls = message.parts?.filter((part: any) => 
                            part.type === 'tool-call'
                        ) || [];

                        return (
                            <div
                                key={message.id}
                                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`${
                                        message.role === 'user'
                                            ? 'bg-blue-600 text-white rounded-2xl px-5 py-3.5 max-w-[85%] shadow-sm'
                                            : 'bg-white text-gray-900 rounded-2xl px-5 py-3.5 max-w-full shadow-sm border border-gray-100'
                                    }`}
                                >
                                    {message.role === 'user' ? (
                                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{textContent}</p>
                                    ) : (
                                        <>
                                            <div className="text-[15px] leading-relaxed prose prose-sm max-w-none prose-gray-900 prose-headings:font-semibold prose-headings:text-gray-900 prose-p:text-gray-900 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-strong:text-gray-900 prose-code:text-gray-900 prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 prose-pre:rounded-lg prose-pre:p-3 prose-pre:text-sm">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {textContent || 'Processing...'}
                                                </ReactMarkdown>
                                            </div>

                                            {/* Show tool calls if available */}
                                            {toolCalls.length > 0 && (
                                                <div className="mt-3 pt-3 border-t border-gray-200">
                                                    {toolCalls.map((toolCall: any, index: number) => (
                                                        <div
                                                            key={`${toolCall.toolCallId || index}`}
                                                            className="text-xs text-gray-500 flex items-center gap-1 mb-1"
                                                        >
                                                            <span>🔧</span>
                                                            <span>Used: {toolCall.toolName}</span>
                                                            <span className="text-green-600">✓</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Process custom data parts for tool results */}
                                            {message.parts && message.parts.map((part: any, i: number) => {
                                                if (part.type === 'data-tool-agent' ||
                                                    part.type === 'data-tool-workflow' ||
                                                    part.type === 'data-tool-network') {
                                                    const data = part.data as any;
                                                    if (data?.status) {
                                                        return (
                                                            <div key={`${message.id}-${i}`} className="text-xs text-gray-500 mt-1">
                                                                Status: {data.status}
                                                            </div>
                                                        );
                                                    }
                                                }
                                                return null;
                                            })}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {(status === 'streaming' || status === 'submitted') && (
                        <div className="flex justify-start">
                            <div className="bg-white border border-gray-100 rounded-2xl px-5 py-3.5 shadow-sm">
                                <div className="flex gap-1.5">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex justify-start">
                            <div className="bg-red-50 text-red-700 border border-red-100 rounded-2xl px-5 py-3.5 shadow-sm">
                                <p className="text-[15px]">Error: {error.message}</p>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input */}
            <form
                onSubmit={handleFormSubmit}
                className="border-t border-gray-200/50 bg-white/80 backdrop-blur-sm"
            >
                <div className="max-w-3xl mx-auto px-6 py-4">
                    <div className="flex flex-col gap-3">
                        {!userLocation && (
                            <div className="flex items-center gap-2 bg-amber-50/80 border border-amber-200/50 rounded-xl px-4 py-2.5 backdrop-blur-sm">
                                <span className="text-sm text-amber-700">⏳ Waiting for location...</span>
                            </div>
                        )}
                        <div className="flex gap-3 items-end">
                            <div className="flex-1 relative">
                                <textarea
                                    ref={textareaRef}
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder={userLocation ? "Message MapOps..." : "Waiting for location..."}
                                    disabled={false}
                                    rows={1}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleFormSubmit(e as any);
                                        }
                                    }}
                                    className="w-full resize-none rounded-2xl bg-gray-50/80 border border-gray-200/50 px-5 py-3.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400/50 focus:bg-white transition-all max-h-32 overflow-y-auto backdrop-blur-sm shadow-sm"
                                    style={{
                                        minHeight: '48px',
                                    }}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={status === 'streaming' || status === 'submitted' || !inputValue.trim() || !userLocation}
                                className="rounded-2xl bg-blue-600 px-5 py-3.5 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all flex items-center justify-center min-w-[48px] h-12 shadow-sm hover:shadow-md"
                                title={!userLocation ? 'Waiting for location...' : 'Send message'}
                            >
                                {(status === 'streaming' || status === 'submitted') ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                            </button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}
