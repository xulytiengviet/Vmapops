/**
 * MapOps - Map Setup and Initialization
 * Handles Google Maps initialization and basic map configuration
 */



let map: google.maps.Map | null = null;
let userLocation: { lat: number; lng: number } | null = null;
let userMarker: google.maps.Marker | null = null;
let placesService: any = null;
let routesService: any = null;
let placesAggregateService: any = null;
let geocodingService: any = null;
let roadsService: any = null;

/**
 * Initialize the Google Map
 * This function is called as a callback when the Maps API loads
 */
// initMap is declared globally

function initMap(): void {
    // Default center (San Francisco) - will be updated with user location
    const defaultCenter: { lat: number; lng: number } = { lat: 37.7749, lng: -122.4194 };

    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.error('Map element not found');
        return;
    }

    // Create map instance
    map = new google.maps.Map(mapElement, {
        center: defaultCenter,
        zoom: 13,
        disableDefaultUI: false, // Show default controls
        zoomControl: true,
        mapTypeControl: true,
        scaleControl: true,
        streetViewControl: true,
        fullscreenControl: true
        // Note: styles cannot be used with mapId, so removed
        // If you want custom styling, use mapId with Cloud-based styling in Google Cloud Console
    });

    console.log('Map initialized successfully');

    // Initialize all services
    if (typeof window.PlacesService !== 'undefined') {
        placesService = new window.PlacesService(map);
        console.log('Places Service initialized');
    }

    if (typeof window.RoutesService !== 'undefined') {
        routesService = new window.RoutesService(map);
        console.log('Routes Service initialized');
    }

    if (typeof window.PlacesAggregateService !== 'undefined') {
        placesAggregateService = new window.PlacesAggregateService();
        console.log('Places Aggregate Service initialized');
    }

    if (typeof window.GeocodingService !== 'undefined') {
        geocodingService = new window.GeocodingService();
        if (geocodingService.init) {
            geocodingService.init();
        }
        console.log('Geocoding Service initialized');
    }

    if (typeof window.RoadsService !== 'undefined') {
        roadsService = new window.RoadsService();
        console.log('Roads Service initialized');
    }

    // Get user's current location
    getUserLocation();

    // Add map event listeners
    setupMapEvents();
}

/**
 * Get user's current location using browser geolocation
 */
function getUserLocation(): void {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position: GeolocationPosition) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };

                if (!map) return;

                // Center map on user location
                map.setCenter(userLocation);
                map.setZoom(15);

                // Add marker for user location
                if (userMarker) {
                    userMarker.setPosition(userLocation);
                } else {
                    userMarker = new google.maps.Marker({
                        position: userLocation,
                        map: map,
                        title: 'Your Location',
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: '#4285f4',
                            fillOpacity: 1,
                            strokeColor: '#ffffff',
                            strokeWeight: 2
                        },
                        zIndex: 1000
                    });
                }

                console.log('User location:', userLocation);
            },
            (error: GeolocationPositionError) => {
                console.warn('Geolocation error:', error);
                // If geolocation fails, keep default center
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else {
        console.warn('Geolocation is not supported by this browser');
    }
}

/**
 * Setup map event listeners
 */
function setupMapEvents(): void {
    if (!map) return;

    // Log when map is clicked
    map.addListener('click', (event: google.maps.MapMouseEvent) => {
        if (event.latLng) {
            console.log('Map clicked at:', event.latLng.toJSON());
        }
    });

    // Log when map is dragged
    map.addListener('dragend', () => {
        const center = map?.getCenter();
        if (center) {
            console.log('Map center changed to:', center.toJSON());
        }
    });

    // Log when zoom changes
    map.addListener('zoom_changed', () => {
        console.log('Zoom level:', map?.getZoom());
    });
}

/**
 * Get current map center
 * @returns {Location} {lat, lng}
 */
function getMapCenter(): { lat: number; lng: number } {
    if (map) {
        const center = map.getCenter();
        if (center) {
            return {
                lat: center.lat(),
                lng: center.lng()
            };
        }
    }
    return userLocation || { lat: 37.7749, lng: -122.4194 };
}

/**
 * Get current zoom level
 * @returns {number}
 */
function getZoomLevel(): number {
    return map ? map.getZoom() || 13 : 13;
}

/**
 * Pan map to a specific location
 * @param {Location} location - {lat, lng}
 * @param {number} zoom - Optional zoom level
 */
function panToLocation(location: { lat: number; lng: number }, zoom: number | null = null): void {
    if (map && location) {
        map.panTo(location);
        if (zoom !== null) {
            map.setZoom(zoom);
        }
    }
}

/**
 * Add a marker to the map
 * @param {Location} position - {lat, lng}
 * @param {google.maps.MarkerOptions} options - Marker options
 * @returns {google.maps.Marker | null}
 */
function addMarker(position: { lat: number; lng: number }, options: google.maps.MarkerOptions = {}): google.maps.Marker | null {
    if (!map || !position) return null;

    const markerOptions: google.maps.MarkerOptions = {
        position: position,
        map: map,
        ...options
    };

    return new google.maps.Marker(markerOptions);
}

/**
 * Clear all markers from the map (except user marker)
 * @param {google.maps.Marker[]} markers - Array of marker objects to clear
 */
function clearMarkers(markers: google.maps.Marker[] = []): void {
    markers.forEach(marker => {
        if (marker && marker !== userMarker) {
            marker.setMap(null);
        }
    });
}

// Export functions for use in other modules
if (typeof window !== 'undefined') {
    (window as any).mapOps = {
        map,
        getUserLocation,
        getMapCenter,
        getZoomLevel,
        panToLocation,
        addMarker,
        clearMarkers,
        userLocation,
        placesService,
        routesService,
        placesAggregateService,
        geocodingService,
        roadsService
    };
}

// Make initMap available globally
(window as any).initMap = initMap;
