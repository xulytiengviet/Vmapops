/**
 * Configuration file for MapOps
 * 
 * Note: API key is injected from .env at build time via scripts/inject-env.js
 */

const CONFIG: {
    API_KEY: string;
    DEFAULT_CENTER: { lat: number; lng: number };
    DEFAULT_ZOOM: number;
    DEBUG: boolean;
    API_ENDPOINTS: { places: string; routes: string; geocoding: string; timezone: string; geolocation: string };
} = {
    // Your Google Maps API key (injected from .env at build time)
    API_KEY: '', // Will be replaced by inject-env.js script
    
    // Default map center (if geolocation fails)
    DEFAULT_CENTER: {
        lat: 37.7749,  // San Francisco
        lng: -122.4194
    },
    
    // Default zoom level
    DEFAULT_ZOOM: 13,
    
    // Enable debug logging
    DEBUG: true,
    
    // API endpoints (for future server-side implementation)
    API_ENDPOINTS: {
        places: 'https://places.googleapis.com/v1',
        routes: 'https://routes.googleapis.com',
        geocoding: 'https://maps.googleapis.com/maps/api/geocode',
        timezone: 'https://maps.googleapis.com/maps/api/timezone',
        geolocation: 'https://www.googleapis.com/geolocation/v1'
    }
};

// Make it available globally
if (typeof window !== 'undefined') {
    (window as any).CONFIG = CONFIG;
}

// CONFIG is available via window.CONFIG
