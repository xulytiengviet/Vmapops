#!/usr/bin/env node

/**
 * Test script for the new AI SDK chat route
 * Tests that the Mastra agent works with tool calling and mapCommands
 */

const testChatEndpoint = async () => {
    try {
        console.log('\n🧪 Testing AI SDK Chat Route...\n');

        // Test message
        const messages = [
            {
                role: 'user',
                content: 'Find coffee shops near me'
            }
        ];

        // Test context with a San Francisco location
        const context = {
            userLocation: {
                lat: 37.7749,
                lng: -122.4194
            },
            mapCenter: {
                lat: 37.7749,
                lng: -122.4194
            },
            mapZoom: 14
        };

        console.log('📍 Test location: San Francisco (37.7749, -122.4194)');
        console.log('💬 Test query: "Find coffee shops near me"\n');

        // Make request to new AI SDK route
        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages,
                context
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Check if response is streaming
        const contentType = response.headers.get('content-type');
        console.log('📡 Response Content-Type:', contentType);

        if (contentType?.includes('text/event-stream') || contentType?.includes('text/plain')) {
            console.log('✅ Streaming response detected\n');

            // Read stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                // Parse SSE format
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.trim()) {
                        // AI SDK format: data lines start with a number followed by colon
                        if (line.match(/^\d+:/)) {
                            const jsonStart = line.indexOf('{');
                            if (jsonStart !== -1) {
                                try {
                                    const json = JSON.parse(line.slice(jsonStart));

                                    // Check for different event types
                                    if (json.type === 'text-delta') {
                                        process.stdout.write(json.textDelta || '');
                                    } else if (json.type === 'tool-call') {
                                        console.log(`\n🔧 Tool called: ${json.toolName}`);
                                    } else if (json.type === 'finish') {
                                        console.log('\n\n✅ Stream finished');
                                        if (json.usage) {
                                            console.log('📊 Usage:', json.usage);
                                        }
                                    } else if (json.mapCommands) {
                                        console.log('\n🗺️ Map commands received:', json.mapCommands.length);
                                        json.mapCommands.forEach(cmd => {
                                            console.log(`   - ${cmd.type}: ${JSON.stringify(cmd.payload).slice(0, 50)}...`);
                                        });
                                    }
                                } catch (e) {
                                    // Not JSON, might be other format
                                }
                            }
                        }
                    }
                }
            }
        } else {
            // Non-streaming response
            const data = await response.json();
            console.log('📦 Response:', JSON.stringify(data, null, 2));
        }

        console.log('\n✨ Test completed successfully!\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    }
};

// Run the test
testChatEndpoint().catch(console.error);