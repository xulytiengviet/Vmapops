/**
 * Distance Calculator Utilities
 * Shared helpers for calculating distances and travel times
 */

export interface Location {
  lat: number;
  lng: number;
}

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(from: Location, to: Location): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (from.lat * Math.PI) / 180; // Convert to radians
  const φ2 = (to.lat * Math.PI) / 180;
  const Δφ = ((to.lat - from.lat) * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimate walking time based on distance
 * Assumes average walking speed of 1.4 m/s (5 km/h)
 * Returns time in minutes
 */
export function estimateWalkingTime(distanceMeters: number): number {
  const walkingSpeedMeterPerSecond = 1.4; // 5 km/h
  const seconds = distanceMeters / walkingSpeedMeterPerSecond;
  return Math.round(seconds / 60);
}

/**
 * Format distance for display
 */
export function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)}m`;
  }
  return `${(distanceMeters / 1000).toFixed(1)}km`;
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}min`;
  }
  return `${hours}h ${minutes}min`;
}

/**
 * Calculate bounds (viewport) for a set of locations
 */
export function calculateBounds(
  locations: Location[]
): { north: number; south: number; east: number; west: number } | null {
  if (locations.length === 0) return null;

  let minLat = locations[0].lat;
  let maxLat = locations[0].lat;
  let minLng = locations[0].lng;
  let maxLng = locations[0].lng;

  for (const loc of locations) {
    minLat = Math.min(minLat, loc.lat);
    maxLat = Math.max(maxLat, loc.lat);
    minLng = Math.min(minLng, loc.lng);
    maxLng = Math.max(maxLng, loc.lng);
  }

  // Add 5% padding
  const latPadding = (maxLat - minLat) * 0.05;
  const lngPadding = (maxLng - minLng) * 0.05;

  return {
    north: maxLat + latPadding,
    south: minLat - latPadding,
    east: maxLng + lngPadding,
    west: minLng - lngPadding,
  };
}

/**
 * Detect density level of results in an area
 */
export function detectDensity(
  resultCount: number
): "sparse" | "moderate" | "dense" {
  if (resultCount > 20) return "dense";
  if (resultCount > 5) return "moderate";
  return "sparse";
}
