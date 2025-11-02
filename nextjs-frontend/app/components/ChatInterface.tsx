'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMapState } from '@/app/hooks/useMapState';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

interface ChatInterfaceProps {
    onPlaceSelect?: (place: any) => void;
}

export function ChatInterface({ onPlaceSelect: _ }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const mapState = useMapState();
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

    // Get user's geolocation on mount
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    });
                },
                (err) => {
                    console.warn('Geolocation not available:', err);
                }
            );
        }
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!input.trim() || loading) return;

        // Add user message
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        // Create assistant message that will be updated via streaming
        const assistantMessageId = (Date.now() + 1).toString();
        const assistantMessage: Message = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
        };
        setMessages((prev) => [...prev, assistantMessage]);

        try {
            // Use streaming endpoint
            const response = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [
                        ...messages.map((m) => ({ role: m.role, content: m.content })),
                        { role: 'user', content: input },
                    ],
                    context: {
                        userLocation: userLocation,
                        mapCenter: mapState.center,
                        mapZoom: mapState.zoom,
                    },
                }),
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }

            // Process Server-Sent Events
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const dataStr = line.slice(6);
                            if (dataStr === '[DONE]') {
                                console.log('[ChatInterface] Stream finished');
                                continue;
                            }

                            try {
                                const data = JSON.parse(dataStr);
                                console.log('[ChatInterface] Stream event:', data.type);

                                switch (data.type) {
                                    case 'status':
                                        // Show initial status
                                        setMessages((prev) =>
                                            prev.map((msg) =>
                                                msg.id === assistantMessageId
                                                    ? { ...msg, content: data.message || 'Processing...' }
                                                    : msg
                                            )
                                        );
                                        break;

                                    case 'text-delta':
                                        // Append text incrementally
                                        fullContent += data.content;
                                        setMessages((prev) =>
                                            prev.map((msg) =>
                                                msg.id === assistantMessageId
                                                    ? { ...msg, content: fullContent }
                                                    : msg
                                            )
                                        );
                                        break;

                                    case 'tool-call':
                                        // Show tool usage notification
                                        const toolMessage = fullContent + (fullContent ? '\n\n' : '') + (data.message || `Using ${data.toolName}...`);
                                        setMessages((prev) =>
                                            prev.map((msg) =>
                                                msg.id === assistantMessageId
                                                    ? { ...msg, content: toolMessage }
                                                    : msg
                                            )
                                        );
                                        break;

                                    case 'finish':
                                        // Final update with mapCommands
                                        fullContent = data.content;
                                        setMessages((prev) =>
                                            prev.map((msg) =>
                                                msg.id === assistantMessageId
                                                    ? { ...msg, content: fullContent }
                                                    : msg
                                            )
                                        );

                                        if (data.mapCommands && Array.isArray(data.mapCommands)) {
                                            console.log('[ChatInterface] Executing', data.mapCommands.length, 'mapCommands');
                                            mapState.executeMapCommands(data.mapCommands);
                                        }
                                        break;

                                    case 'error':
                                        throw new Error(data.message);
                                }
                            } catch (e) {
                                console.error('[ChatInterface] Error parsing stream data:', e);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
            };

            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-lg overflow-hidden">
            {/* Header */}
            <div className="px-4 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-blue-600">
                <h2 className="text-lg font-semibold text-white">City Analyst</h2>
                <p className="text-sm text-blue-100">Ask about places nearby</p>
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

                {messages.map((message) => (
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
                                <p className="text-sm">{message.content}</p>
                            ) : (
                                <div className="text-sm prose prose-sm max-w-none prose-gray-900">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {message.content}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {loading && (
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

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form
                onSubmit={handleSubmit}
                className="px-4 py-4 border-t border-gray-200 bg-gray-50"
            >
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about places..."
                        disabled={loading}
                        className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                    <button
                        type="submit"
                        disabled={loading || !input.trim()}
                        className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-gray-400 transition-colors flex items-center gap-2"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                </div>
            </form>
        </div>
    );
}
