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
        timezone: string;
        geolocation: string;
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
    timeZoneService: any | null;
    geolocationService: any | null;
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
    // Transit-specific options
    arrivalTime?: string | Date;
    departureTime?: string | Date;
    transitPreferences?: TransitPreferences;
    computeAlternativeRoutes?: boolean;
    language?: string;
}

export interface TransitPreferences {
    allowedTravelModes?: ('BUS' | 'SUBWAY' | 'TRAIN' | 'LIGHT_RAIL' | 'RAIL')[];
    routingPreference?: 'LESS_WALKING' | 'FEWER_TRANSFERS';
}

export interface TransitDetails {
    departureStop?: {
        name?: string;
        location?: { lat: number; lng: number };
    };
    arrivalStop?: {
        name?: string;
        location?: { lat: number; lng: number };
    };
    departureTime?: string;
    arrivalTime?: string;
    localizedDepartureTime?: {
        time?: { text?: string };
        timeZone?: string;
    };
    localizedArrivalTime?: {
        time?: { text?: string };
        timeZone?: string;
    };
    headsign?: string;
    transitLine?: {
        agencies?: Array<{
            name?: string;
            phoneNumber?: string;
            uri?: string;
        }>;
        name?: string;
        color?: string;
        nameShort?: string;
        textColor?: string;
        vehicle?: {
            name?: { text?: string };
            type?: string;
            iconUri?: string;
        };
    };
    stopCount?: number;
}

export interface DistanceMatrixOptions {
    travelMode?: 'DRIVE' | 'WALK' | 'BICYCLE' | 'TRANSIT';
    avoidHighways?: boolean;
    avoidTolls?: boolean;
    avoidFerries?: boolean;
    // Transit-specific options
    arrivalTime?: string | Date;
    departureTime?: string | Date;
    transitPreferences?: TransitPreferences;
    language?: string;
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

export interface TimeZoneOptions {
    timestamp?: number | Date;
    language?: string;
}

export interface TimeZoneResult {
    timeZoneId: string;
    timeZoneName: string;
    rawOffset: number;
    dstOffset: number;
    utcOffset: number;
    utcOffsetHours: number;
    currentTime: Date;
    isDst: boolean;
}

export interface GeolocationOptions {
    considerIp?: boolean;
    wifiAccessPoints?: Array<{
        macAddress: string;
        signalStrength?: number;
        signalToNoiseRatio?: number;
        channel?: number;
    }>;
    cellTowers?: Array<{
        cellId: number;
        locationAreaCode: number;
        mobileCountryCode: number;
        mobileNetworkCode: number;
        age?: number;
        signalStrength?: number;
        timingAdvance?: number;
    }>;
}

export interface GeolocationResult {
    location: { lat: number; lng: number };
    accuracy: number;
    timestamp: Date;
    source?: 'gps' | 'geolocation-api' | 'ip';
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
        TimeZoneService?: any;
        GeolocationService?: any;
    }
}
