import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Mastra API client utilities
 */
const MASTRA_URL = process.env.NEXT_PUBLIC_MASTRA_URL || 'http://localhost:4111';

export async function callMastraAgent(messages: Array<{ role: string; content: string }>) {
    const response = await fetch(`${MASTRA_URL}/api/agents/cityAnalystAgent/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages })
    });

    if (!response.ok) {
        throw new Error(`Mastra API error: ${response.statusText}`);
    }

    return response;
}

export async function parseQuery(query: string) {
    const response = await fetch(`${MASTRA_URL}/api/parse-query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });

    if (!response.ok) {
        throw new Error(`Query parsing error: ${response.statusText}`);
    }

    return response.json();
}

export async function callTool(toolName: string, input: Record<string, any>) {
    const response = await fetch(`${MASTRA_URL}/api/tools/${toolName}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
    });

    if (!response.ok) {
        throw new Error(`Tool call error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result;
}

/**
 * Format location for display
 */
export function formatLocation(location: { lat: number; lng: number }): string {
    return `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
}

/**
 * Calculate distance between two points in meters
 */
export function calculateDistance(
    loc1: { lat: number; lng: number },
    loc2: { lat: number; lng: number }
): number {
    const R = 6371000; // Earth's radius in meters
    const lat1 = (loc1.lat * Math.PI) / 180;
    const lat2 = (loc2.lat * Math.PI) / 180;
    const deltaLat = ((loc2.lat - loc1.lat) * Math.PI) / 180;
    const deltaLng = ((loc2.lng - loc1.lng) * Math.PI) / 180;

    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
    if (meters < 1000) {
        return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
        return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
}

/**
 * Rate limiting helper for API calls
 */
export function debounce<T extends (...args: any[]) => any>(func: T, delay: number): T {
    let timeoutId: NodeJS.Timeout;
    return ((...args: any[]) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    }) as T;
}
