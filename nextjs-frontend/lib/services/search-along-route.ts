/**
 * Search Along Route Service
 * Finds places along a route with minimal detour using Google Places API
 * Implements search along polyline with configurable deviation tolerance
 */

import { PlacesService, Place, PlaceLocation } from './places-service';
import { RoutesService } from './routes-service';
import { SemanticReviewAnalyzer } from './semantic-review-analyzer';
import { getVibeCacheInstance, VibeCacheService } from './vibe-cache-service';

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface SearchAlongRouteOptions {
  // Route data
  routePolyline?: string; // Encoded polyline from Routes API
  routePoints?: RoutePoint[]; // Alternative: array of lat/lng points

  // Search parameters
  query: string; // What to search for
  semanticAttributes?: string[]; // Vibe attributes for semantic filtering

  // Detour settings
  maxDetourMeters?: number; // Maximum detour allowed (default: 500m)
  maxDetourPercent?: number; // Maximum detour as % of route (default: 10%)

  // Search constraints
  maxResults?: number; // Maximum results to return (default: 20)
  radius?: number; // Search radius around route (default: 1000m)
  minRating?: number; // Minimum place rating
  openNow?: boolean; // Only open places
  types?: string[]; // Place types to include
}

export interface PlaceAlongRoute extends Place {
  detourMeters: number;
  detourMinutes: number;
  detourPercent: number;
  originalRouteMinutes: number;
  newRouteMinutes: number;
  isOnRoute: boolean;
  semanticScore?: number;
  semanticAttributes?: Record<string, {
    score: number;
    count: number;
    evidence: string[];
  }>;
}

export class SearchAlongRouteService {
  private placesService: PlacesService;
  private routesService: RoutesService;
  private semanticAnalyzer: SemanticReviewAnalyzer;
  private vibeCache: VibeCacheService;

  constructor() {
    this.placesService = new PlacesService();
    this.routesService = new RoutesService();
    this.semanticAnalyzer = new SemanticReviewAnalyzer();
    this.vibeCache = getVibeCacheInstance();
  }

  /**
   * Search for places along a route with minimal detour
   */
  async searchAlongRoute(
    options: SearchAlongRouteOptions
  ): Promise<PlaceAlongRoute[]> {
    console.log(`[SearchAlongRoute] Starting search for "${options.query}" along route`);

    // 1. Decode polyline or use provided points
    const routePoints = options.routePolyline
      ? this.decodePolyline(options.routePolyline)
      : options.routePoints || [];

    if (routePoints.length < 2) {
      throw new Error('Route must have at least 2 points');
    }

    // 2. Create search boxes along the route
    const searchRadius = options.radius || 1000;
    const searchBoxes = this.createSearchBoxes(routePoints, searchRadius);
    console.log(`[SearchAlongRoute] Created ${searchBoxes.length} search boxes along route`);

    // 3. Search for places in each box
    const allPlaces = new Map<string, Place>(); // Use Map to avoid duplicates

    for (let i = 0; i < searchBoxes.length; i++) {
      const box = searchBoxes[i];

      try {
        // Use text search with location bias
        const results = await this.placesService.textSearch(options.query, {
          location: box.center,
          radius: box.radius,
          minRating: options.minRating,
          openNow: options.openNow,
          maxResults: 10, // Limit per box to avoid too many results
        });

        // Add unique places to collection
        results.forEach(place => {
          if (!allPlaces.has(place.placeId)) {
            allPlaces.set(place.placeId, place);
          }
        });

        // Small delay to avoid rate limiting
        if (i < searchBoxes.length - 1 && i % 3 === 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.warn(`[SearchAlongRoute] Failed to search box ${i}:`, error);
      }
    }

    console.log(`[SearchAlongRoute] Found ${allPlaces.size} unique places along route`);

    // 4. Calculate detour for each place
    const origin = routePoints[0];
    const destination = routePoints[routePoints.length - 1];
    const enrichedPlaces = await this.calculateDetours(
      Array.from(allPlaces.values()),
      origin,
      destination,
      options.maxDetourMeters || 500,
      options.maxDetourPercent || 10
    );

    // 5. Filter by detour constraints
    const filteredByDetour = enrichedPlaces.filter(place => {
      const maxDetourM = options.maxDetourMeters || 500;
      const maxDetourP = options.maxDetourPercent || 10;

      return place.detourMeters <= maxDetourM && place.detourPercent <= maxDetourP;
    });

    console.log(`[SearchAlongRoute] ${filteredByDetour.length} places within detour limits`);

    // 6. Perform semantic analysis if requested
    let finalResults = filteredByDetour;

    if (options.semanticAttributes && options.semanticAttributes.length > 0) {
      console.log(`[SearchAlongRoute] Analyzing semantics for ${options.semanticAttributes.join(', ')}`);
      finalResults = await this.analyzeSemantics(
        filteredByDetour,
        options.semanticAttributes
      );
    }

    // 7. Sort by combined score (detour + semantic)
    finalResults.sort((a, b) => {
      // Primary: semantic score if available
      if (a.semanticScore !== undefined && b.semanticScore !== undefined) {
        const scoreDiff = b.semanticScore - a.semanticScore;
        if (Math.abs(scoreDiff) > 0.1) return scoreDiff > 0 ? 1 : -1;
      }

      // Secondary: prefer places with less detour
      const detourDiff = a.detourMeters - b.detourMeters;
      if (Math.abs(detourDiff) > 100) return detourDiff;

      // Tertiary: rating
      return (b.rating || 0) - (a.rating || 0);
    });

    // 8. Limit results
    const maxResults = options.maxResults || 20;
    return finalResults.slice(0, maxResults);
  }

  /**
   * Create search boxes along the route
   */
  private createSearchBoxes(
    routePoints: RoutePoint[],
    radius: number
  ): Array<{ center: PlaceLocation; radius: number }> {
    const boxes: Array<{ center: PlaceLocation; radius: number }> = [];

    // Sample points along route (every ~2km or 20 points, whichever is less)
    const totalPoints = routePoints.length;
    const sampleInterval = Math.max(1, Math.floor(totalPoints / 20));

    for (let i = 0; i < totalPoints; i += sampleInterval) {
      boxes.push({
        center: {
          lat: routePoints[i].lat,
          lng: routePoints[i].lng,
        },
        radius: radius,
      });
    }

    // Always include the last point
    const lastPoint = routePoints[totalPoints - 1];
    boxes.push({
      center: {
        lat: lastPoint.lat,
        lng: lastPoint.lng,
      },
      radius: radius,
    });

    return boxes;
  }

  /**
   * Calculate detour metrics for each place
   */
  private async calculateDetours(
    places: Place[],
    origin: RoutePoint,
    destination: RoutePoint,
    _maxDetourMeters: number,
    _maxDetourPercent: number
  ): Promise<PlaceAlongRoute[]> {
    if (places.length === 0) return [];

    try {
      // Get original route duration
      const originalRoute = await this.routesService.getDirections({
        origin,
        destination,
        travelMode: 'DRIVE',
        alternatives: false,
      });

      const originalDuration = originalRoute[0]?.durationSeconds || 0;
      const originalDistance = originalRoute[0]?.distanceMeters || 0;
      const originalMinutes = Math.round(originalDuration / 60);

      // Calculate detour for each place in batches
      const BATCH_SIZE = 5;
      const enriched: PlaceAlongRoute[] = [];

      for (let i = 0; i < places.length; i += BATCH_SIZE) {
        const batch = places.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
          batch.map(async (place) => {
            try {
              // Calculate route with waypoint
              const routeWithStop = await this.routesService.getDirections({
                origin,
                destination,
                waypoints: [place.location],
                travelMode: 'DRIVE',
              });

              const newDuration = routeWithStop[0]?.durationSeconds || 0;
              const newDistance = routeWithStop[0]?.distanceMeters || 0;

              const detourMeters = newDistance - originalDistance;
              const detourMinutes = Math.round((newDuration - originalDuration) / 60);
              const detourPercent = originalDistance > 0
                ? (detourMeters / originalDistance) * 100
                : 0;

              return {
                ...place,
                detourMeters,
                detourMinutes,
                detourPercent,
                originalRouteMinutes: originalMinutes,
                newRouteMinutes: Math.round(newDuration / 60),
                isOnRoute: detourMeters < 100, // Consider "on route" if detour < 100m
              } as PlaceAlongRoute;
            } catch (error) {
              console.warn(`[SearchAlongRoute] Failed to calculate detour for ${place.name}:`, error);

              // Fallback: estimate based on straight-line distance
              const detourEstimate = this.estimateDetour(
                place.location,
                origin,
                destination
              );

              return {
                ...place,
                ...detourEstimate,
                originalRouteMinutes: originalMinutes,
                newRouteMinutes: originalMinutes + detourEstimate.detourMinutes,
                isOnRoute: false,
              } as PlaceAlongRoute;
            }
          })
        );

        enriched.push(...batchResults);

        // Small delay between batches
        if (i + BATCH_SIZE < places.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      return enriched;
    } catch (error) {
      console.error('[SearchAlongRoute] Failed to calculate detours:', error);

      // Fallback: return places with estimated detours
      return places.map(place => ({
        ...place,
        ...this.estimateDetour(place.location, origin, destination),
        originalRouteMinutes: 0,
        newRouteMinutes: 0,
        isOnRoute: false,
      }));
    }
  }

  /**
   * Estimate detour using Haversine distance
   */
  private estimateDetour(
    placeLocation: PlaceLocation,
    origin: RoutePoint,
    destination: RoutePoint
  ): { detourMeters: number; detourMinutes: number; detourPercent: number } {
    const directDistance = this.haversineDistance(origin, destination);
    const viaPlaceDistance =
      this.haversineDistance(origin, placeLocation) +
      this.haversineDistance(placeLocation, destination);

    const detourMeters = viaPlaceDistance - directDistance;
    const detourMinutes = Math.round(detourMeters / 1000); // Rough estimate: 1km = 1 minute
    const detourPercent = directDistance > 0
      ? (detourMeters / directDistance) * 100
      : 0;

    return { detourMeters, detourMinutes, detourPercent };
  }

  /**
   * Calculate Haversine distance between two points
   */
  private haversineDistance(p1: RoutePoint, p2: RoutePoint): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (p1.lat * Math.PI) / 180;
    const φ2 = (p2.lat * Math.PI) / 180;
    const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
    const Δλ = ((p2.lng - p1.lng) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Analyze semantic attributes for places
   */
  private async analyzeSemantics(
    places: PlaceAlongRoute[],
    attributes: string[]
  ): Promise<PlaceAlongRoute[]> {
    const BATCH_SIZE = 5;
    const enriched: PlaceAlongRoute[] = [];

    for (let i = 0; i < places.length; i += BATCH_SIZE) {
      const batch = places.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (place) => {
          try {
            // Check cache first
            const cachedAnalysis = this.vibeCache.get(place.placeId, attributes);

            if (cachedAnalysis) {
              const semanticScore = this.calculateSemanticScore(cachedAnalysis, attributes);
              return {
                ...place,
                semanticAttributes: cachedAnalysis,
                semanticScore,
              };
            }

            // Fetch details and analyze
            const details = await this.placesService.getPlaceDetails(place.placeId);
            const reviews = details.reviews || [];
            const reviewCount = reviews.length;
            const lastReviewTime = reviews[0]?.publishTime;

            const analysis = await this.semanticAnalyzer.analyze(reviews, attributes);

            // Cache the result
            this.vibeCache.set(
              place.placeId,
              attributes,
              analysis,
              reviewCount,
              lastReviewTime
            );

            const semanticScore = this.calculateSemanticScore(analysis, attributes);

            return {
              ...place,
              semanticAttributes: analysis,
              semanticScore,
            };
          } catch (error) {
            console.warn(`[SearchAlongRoute] Failed semantic analysis for ${place.name}:`, error);
            return place;
          }
        })
      );

      enriched.push(...batchResults);

      // Delay between batches
      if (i + BATCH_SIZE < places.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return enriched;
  }

  /**
   * Calculate overall semantic score
   */
  private calculateSemanticScore(
    analysis: Record<string, { score: number; count: number; evidence: string[] }>,
    attributes: string[]
  ): number {
    const scores = attributes.map(attr => analysis[attr]?.score || 0);
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  /**
   * Decode Google Maps polyline to array of points
   */
  private decodePolyline(encoded: string): RoutePoint[] {
    const points: RoutePoint[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte: number;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push({
        lat: lat / 1e5,
        lng: lng / 1e5,
      });
    }

    return points;
  }
}