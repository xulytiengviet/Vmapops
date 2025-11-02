/**
 * MapOps - Next.js Frontend Type Definitions
 */

export interface Location {
    lat: number;
    lng: number;
}

export interface Place {
    id: string;
    displayName?: string;
    name?: string;
    formattedAddress: string;
    location: Location;
    rating?: number;
    userRatingCount?: number;
    types?: string[];
    openNow?: boolean;
    priceLevel?: number;
    photos?: Array<{ name: string; heightPx: number; widthPx: number }>;
    websiteUri?: string;
    internationalPhoneNumber?: string;
    distance?: number;
    duration?: number;
    distanceText?: string;
    durationText?: string;
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

export interface PlaceFilters {
    openNow?: boolean;
    minRating?: number;
    maxPriceLevel?: number;
    outdoorSeating?: boolean;
}

export interface WalkingTimeResult {
    duration: number; // seconds
    distance: number; // meters
    durationText: string;
    distanceText: string;
}

export interface QueryParsed {
    searchTerms: string;
    filters: PlaceFilters;
    radius?: number;
    maxResults?: number;
    walkingTime?: number;
    explanation: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    places?: Place[];
    metadata?: Record<string, any>;
}

export interface SearchResult {
    places: Place[];
    explanation: string;
    totalResults: number;
}
