#!/usr/bin/env node

/**
 * Test script for Mastra's native AI SDK streaming
 * Tests the agent.stream() method with format: "aisdk"
 */

const testMastraStream = async () => {
    try {
        console.log('\n🧪 Testing Mastra AI SDK Stream...\n');

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

        // Make request to AI SDK route
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
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const contentType = response.headers.get('content-type');
        console.log('📡 Response Content-Type:', contentType);
        console.log('📡 Response Status:', response.status);
        console.log('📡 Response Headers:', Object.fromEntries(response.headers.entries()));

        // Read the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let chunkCount = 0;

        console.log('\n📝 Stream Content:\n');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunkCount++;
            const chunk = decoder.decode(value, { stream: true });

            // Log raw chunk
            console.log(`--- Chunk ${chunkCount} (${chunk.length} bytes) ---`);
            console.log(chunk.slice(0, 500)); // First 500 chars

            buffer += chunk;
        }

        console.log('\n📊 Summary:');
        console.log(`- Total chunks: ${chunkCount}`);
        console.log(`- Total bytes: ${buffer.length}`);

        // Try to parse the stream data
        console.log('\n🔍 Stream Analysis:');

        // Look for AI SDK format patterns
        const lines = buffer.split('\n');
        let messageCount = 0;
        let toolCallCount = 0;
        let dataPartCount = 0;

        lines.forEach(line => {
            if (line.includes('"type":"text"')) messageCount++;
            if (line.includes('"type":"tool-call"')) toolCallCount++;
            if (line.includes('"type":"data"')) dataPartCount++;
            if (line.includes('mapCommands')) {
                console.log('✅ Found mapCommands in stream!');
            }
        });

        console.log(`- Text messages: ${messageCount}`);
        console.log(`- Tool calls: ${toolCallCount}`);
        console.log(`- Data parts: ${dataPartCount}`);

        console.log('\n✨ Test completed!\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    }
};

// Run the test
testMastraStream().catch(console.error);