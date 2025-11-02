'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMapState } from '@/app/hooks/useMapState';

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
    const mapState = useMapState();
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [inputValue, setInputValue] = useState('');
    
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

    // Subscribe to separate SSE channel for mapCommands (Fix #2 - most reliable)
    useEffect(() => {
        console.log('[ChatInterface] Setting up EventSource for mapCommands');
        const es = new EventSource('/api/map/stream');
        
        es.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.commands && Array.isArray(data.commands)) {
                    const commandTypes = data.commands.map((cmd: any) => cmd.type);
                    console.log(`[ChatInterface] ✅ Received ${data.commands.length} mapCommands from SSE:`, commandTypes.join(', '));
                    console.log('[ChatInterface] Full commands:', data.commands);
                    mapState.executeMapCommands(data.commands);
                }
            } catch (error) {
                console.error('[ChatInterface] Error parsing SSE mapCommands:', error);
            }
        };
        
        es.onerror = (error) => {
            console.error('[ChatInterface] EventSource error:', error);
            // Don't close on error - SSE will auto-reconnect
        };
        
        return () => {
            console.log('[ChatInterface] Closing EventSource');
            es.close();
        };
    }, [mapState]);

    // Use the AI SDK's useChat hook with DefaultChatTransport as per Mastra docs
    const { messages, status, error, sendMessage } = useChat({
        transport: new DefaultChatTransport({
            api: '/api/chat',
            prepareSendMessagesRequest({ messages }) {
                // Use ref to get current location value (avoids closure issues)
                const currentLocation = userLocationRef.current;
                
                const context = {
                    userLocation: currentLocation,
                    mapCenter: mapState.center,
                    mapZoom: mapState.zoom,
                    mapBounds: mapState.bounds,
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

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handle form submission
    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const isLoading = status === 'streaming' || status === 'submitted';
        if (!inputValue.trim() || isLoading) return;

        // Send message using AI SDK's sendMessage
        sendMessage({ text: inputValue });
        setInputValue('');
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-lg overflow-hidden">
            {/* Header */}
            <div className="px-4 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-blue-600">
                <h2 className="text-lg font-semibold text-white">City Analyst</h2>
                <div className="flex items-center gap-2">
                    <p className="text-sm text-blue-100">Ask about places nearby</p>
                    {userLocation ? (
                        <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">📍 Location Active</span>
                    ) : (
                        <span className="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded-full">⏳ Getting location...</span>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center">
                            <div className="text-lg mb-2">👋 Welcome to MapOps</div>
                            <div className="text-sm">Start by asking about places around you</div>
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
                                className={`max-w-md rounded-lg px-4 py-2 ${message.role === 'user'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-900'
                                    }`}
                            >
                                {message.role === 'user' ? (
                                    <p className="text-sm">{textContent}</p>
                                ) : (
                                    <>
                                        <div className="text-sm prose prose-sm max-w-none prose-gray-900">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {textContent || 'Processing...'}
                                            </ReactMarkdown>
                                        </div>

                                        {/* Show tool calls if available */}
                                        {toolCalls.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-gray-200">
                                                {toolCalls.map((toolCall: any, index: number) => (
                                                    <div
                                                        key={`${toolCall.toolCallId || index}`}
                                                        className="text-xs text-gray-600 flex items-center gap-1 mb-1"
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
                        <div className="bg-gray-100 rounded-lg px-4 py-2">
                            <div className="flex gap-1">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="flex justify-start">
                        <div className="bg-red-100 text-red-700 rounded-lg px-4 py-2">
                            <p className="text-sm">Error: {error.message}</p>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form
                onSubmit={handleFormSubmit}
                className="px-4 py-4 border-t border-gray-200 bg-gray-50"
            >
                <div className="flex flex-col gap-2">
                    {!userLocation && (
                        <div className="text-xs text-yellow-600 flex items-center gap-1">
                            <span>⏳</span>
                            <span>Waiting for location permission... Messages will be enabled once location is available.</span>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder={userLocation ? "Ask about places..." : "Waiting for location..."}
                            disabled={false}  // Never disable the input field
                            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                    <button
                        type="submit"
                        disabled={status === 'streaming' || status === 'submitted' || !inputValue.trim() || !userLocation}
                        className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-gray-400 transition-colors flex items-center gap-2"
                        title={!userLocation ? 'Waiting for location...' : 'Send message'}
                    >
                        {(status === 'streaming' || status === 'submitted') ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                </div>
                </div>
            </form>
        </div>
    );
}
