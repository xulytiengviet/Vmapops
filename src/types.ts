/**
 * MapOps - Type Definitions
 */

export interface Location {
    lat: number;
    lng: number;
}

export interface Config {
    API_KEY: string;
    DEFAULT_CENTER: Location;
    DEFAULT_ZOOM: number;
    DEBUG: boolean;
    API_ENDPOINTS: {
        places: string;
        routes: string;
        geocoding: string;
    };
}

export interface MapOps {
    map: google.maps.Map | null;
    getUserLocation: () => void;
    getMapCenter: () => Location;
    getZoomLevel: () => number;
    panToLocation: (location: Location, zoom?: number) => void;
    addMarker: (position: Location, options?: google.maps.MarkerOptions) => google.maps.Marker | null;
    clearMarkers: (markers: google.maps.Marker[]) => void;
    userLocation: Location | null;
    placesService: any | null;
    routesService: any | null;
    placesAggregateService: any | null;
    geocodingService: any | null;
    roadsService: any | null;
}

export interface TextSearchOptions {
    location?: Location | null;
    radius?: number;
    maxResultCount?: number;
    includedTypes?: string[];
    excludedTypes?: string[];
    openNow?: boolean;
    priceLevel?: number | null;
    minRating?: number | null;
    language?: string;
}

export interface NearbySearchOptions {
    radius?: number;
    type?: string | null;
    keyword?: string | null;
}

export interface PlaceDetailsOptions {
    fields?: string[];
}

export interface AutocompleteOptions {
    location?: Location | null;
}

export interface RouteOptions {
    travelMode?: 'DRIVE' | 'WALK' | 'BICYCLE' | 'TRANSIT';
    waypoints?: { lat: number; lng: number }[];
    avoidHighways?: boolean;
    avoidTolls?: boolean;
    avoidFerries?: boolean;
    optimize?: boolean;
}

export interface DistanceMatrixOptions {
    travelMode?: 'DRIVE' | 'WALK' | 'BICYCLE' | 'TRANSIT';
    avoidHighways?: boolean;
    avoidTolls?: boolean;
    avoidFerries?: boolean;
}

export interface RouteOptimizationOptions {
    travelMode?: 'DRIVE' | 'WALK' | 'BICYCLE' | 'TRANSIT';
    vehicleType?: string;
}

export interface RouteRenderer {
    polyline: google.maps.Polyline | null;
    clear: () => void;
}

export interface WalkingTimeResult {
    duration: number; // seconds
    distance: number; // meters
    durationText: string;
    distanceText: string;
}

export interface PlaceFilters {
    openNow?: boolean;
    minRating?: number;
    maxPriceLevel?: number;
    outdoorSeating?: boolean;
}

export interface PlacesAggregateOptions {
    includedTypes?: string[];
    excludedTypes?: string[];
    minRating?: number | null;
    maxPriceLevel?: number | null;
    openNow?: boolean;
    language?: string;
}

export interface GeocodeOptions {
    region?: string | null;
    bounds?: google.maps.LatLngBounds | null;
    componentRestrictions?: google.maps.GeocoderComponentRestrictions | null;
}

export interface ReverseGeocodeOptions {
    resultType?: string[];
    locationType?: string[];
}

export interface SnapToRoadsOptions {
    interpolate?: boolean;
}

export interface GeocodeResult {
    lat: number;
    lng: number;
    formattedAddress: string;
    addressComponents?: google.maps.GeocoderAddressComponent[];
    placeId?: string;
    types?: string[];
}

export interface Reverseany {
    formattedAddress: string;
    addressComponents?: google.maps.GeocoderAddressComponent[];
    placeId?: string;
    types?: string[];
    location?: { latitude: number; longitude: number };
}

// Make interfaces available globally
declare global {
    interface Window {
        CONFIG?: Config;
        mapOps?: MapOps;
        PlacesService?: any;
        RoutesService?: any;
        PlacesAggregateService?: any;
        GeocodingService?: any;
        RoadsService?: any;
    }
}
