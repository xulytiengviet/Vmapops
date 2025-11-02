/**
 * Configuration file for MapOps
 * 
 * Instructions:
 * 1. Copy this file to config.js
 * 2. Replace YOUR_API_KEY_HERE with your actual Google Maps API key
 * 3. config.js is gitignored for security
 */

const CONFIG = {
    // Your Google Maps API key
    // Get one at: https://console.cloud.google.com/google/maps-apis
    API_KEY: 'YOUR_API_KEY_HERE',
    
    // Default map center (if geolocation fails)
    DEFAULT_CENTER: {
        lat: 37.7749,  // San Francisco
        lng: -122.4194
    },
    
    // Default zoom level
    DEFAULT_ZOOM: 13,
    
    // Enable debug logging
    DEBUG: true
};

// Make it available globally
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}
