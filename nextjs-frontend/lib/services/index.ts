/**
 * MapOps - Services Initialization for Next.js
 * Initializes and exports all Google Maps services
 */

import TimeZoneService from './timezone-service';
import GeolocationService from './geolocation-service';

export interface MapOpsServices {
    timeZoneService: TimeZoneService | null;
    geolocationService: GeolocationService | null;
}

/**
 * Initialize all services and make them available globally
 */
export function initializeServices(): MapOpsServices {
    const services: MapOpsServices = {
        timeZoneService: new TimeZoneService(),
        geolocationService: new GeolocationService()
    };

    // Make services available globally via window.mapOps
    if (typeof window !== 'undefined') {
        if (!(window as any).mapOps) {
            (window as any).mapOps = {};
        }
        (window as any).mapOps.timeZoneService = services.timeZoneService;
        (window as any).mapOps.geolocationService = services.geolocationService;
        
        // Also store API key globally for convenience
        if (!(window as any).GOOGLE_MAPS_API_KEY && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
            (window as any).GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        }
        
        console.log('MapOps services initialized:', {
            timeZoneService: !!services.timeZoneService,
            geolocationService: !!services.geolocationService,
            apiKeyAvailable: !!(window as any).GOOGLE_MAPS_API_KEY || !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        });
    }

    return services;
}

// Export service classes for direct use
export { TimeZoneService, GeolocationService };

