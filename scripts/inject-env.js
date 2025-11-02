#!/usr/bin/env node

/**
 * Inject environment variables into config files
 * Runs after TypeScript compilation
 */

const fs = require('fs');
const path = require('path');

// Read .env file
const envPath = path.join(__dirname, '..', '.env');
let apiKey = '';

try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/GOOGLE_API_KEY\s*=\s*(.+)/);
    if (match) {
        apiKey = match[1].trim();
        console.log('✓ API Key loaded from .env');
    } else {
        console.warn('⚠ GOOGLE_API_KEY not found in .env');
    }
} catch (error) {
    console.error('⚠ .env file not found. Skipping API key injection.');
}

// Update config.js if API key is available
if (apiKey) {
    const configPath = path.join(__dirname, '..', 'dist', 'config.js');
    try {
        let configContent = fs.readFileSync(configPath, 'utf8');
        // Replace the empty API_KEY with the actual key
        configContent = configContent.replace(
            /API_KEY:\s*['"](['"]?)['"]?/,
            `API_KEY: '${apiKey}'`
        );
        fs.writeFileSync(configPath, configContent);
        console.log('✓ API Key injected into dist/config.js');
    } catch (error) {
        console.error('✗ Failed to inject API key:', error.message);
    }
}

// Update index.html with API key in the injection script
if (apiKey) {
    const indexPath = path.join(__dirname, '..', 'index.html');
    try {
        let htmlContent = fs.readFileSync(indexPath, 'utf8');
        // Update the API key in the inject script
        htmlContent = htmlContent.replace(
            /CONFIG\.API_KEY\s*=\s*['"]([^'"]*)['"]/,
            `CONFIG.API_KEY = '${apiKey}'`
        );
        fs.writeFileSync(indexPath, htmlContent);
        console.log('✓ API Key injected into index.html');
    } catch (error) {
        console.error('✗ Failed to inject API key into HTML:', error.message);
    }
}

console.log('✓ Environment injection complete');
