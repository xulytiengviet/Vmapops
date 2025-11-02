/**
 * Routes Service
 * Wrapper for Google Routes API (directions and distance matrix)
 * Works in Next.js API routes (server-side)
 */

export interface RouteLocation {
  lat: number;
  lng: number;
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteLeg {
  startAddress: string;
  endAddress: string;
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
}

export interface Route {
  summary: string;
  legs: RouteLeg[];
  polyline: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface DirectionsOptions {
  origin: RouteLocation | string;
  destination: RouteLocation | string;
  travelMode?: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";
  departureTime?: string;
  alternatives?: boolean;
}

export interface DistanceMatrixOptions {
  origins: (RouteLocation | string)[];
  destinations: (RouteLocation | string)[];
  travelMode?: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";
}

export class RoutesService {
  private apiKey: string;
  private baseUrl = "https://routes.googleapis.com/directions/v2:computeRoutes";
  private distanceMatrixUrl =
    "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

  constructor() {
    this.apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
    if (!this.apiKey) {
      throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is required");
    }
  }

  /**
   * Get directions from origin to destination
   * Supports multiple travel modes and can return alternative routes
   */
  async getDirections(options: DirectionsOptions): Promise<Route[]> {
    try {
      const origin = this.normalizeLocation(options.origin);
      const destination = this.normalizeLocation(options.destination);

      // Routes API v2 expects latLng format: { latitude, longitude }
      const body = {
        origin: {
          location: {
            latLng: {
              latitude: origin.lat,
              longitude: origin.lng,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: destination.lat,
              longitude: destination.lng,
            },
          },
        },
        travelMode: options.travelMode || "DRIVE",
        routingPreference: "TRAFFIC_AWARE", // Traffic-aware routing
        computeAlternativeRoutes: options.alternatives || false,
        routeModifiers: {
          avoidTolls: false,
          avoidHighways: false,
          avoidFerries: false,
        },
        languageCode: "en-US",
        units: "METRIC",
      };

      if (options.departureTime) {
        (body as any).departureTime = options.departureTime;
      }

      console.log('[RoutesService] Request body:', JSON.stringify(body, null, 2));

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          // Field mask is required by Routes API v2
          // Request only the fields we actually use
          "X-Goog-FieldMask": [
            "routes.polyline.encodedPolyline",
            "routes.legs",
            "routes.distanceMeters",
            "routes.duration",
            "routes.legs.distanceMeters",
            "routes.legs.duration",
            "routes.legs.steps.distanceMeters",
            "routes.legs.steps.navigationInstruction",
            "routes.legs.startLocation",
            "routes.legs.endLocation",
          ].join(","),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[RoutesService] API Error Response:', errorText);
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(`Routes API error: ${response.statusText} - ${JSON.stringify(errorJson)}`);
        } catch {
          throw new Error(`Routes API error: ${response.statusText} - ${errorText}`);
        }
      }

      const data = await response.json();

      if (!data.routes || data.routes.length === 0) {
        throw new Error("No routes found");
      }

      return data.routes.map((route: any) => this.mapRoute(route));
    } catch (error) {
      console.error("RoutesService.getDirections error:", error);
      throw error;
    }
  }

  /**
   * Calculate distances and times between multiple origins and destinations
   */
  async getDistanceMatrix(
    options: DistanceMatrixOptions
  ): Promise<any[][]> {
    try {
      const origins = options.origins.map((loc) =>
        typeof loc === "string" ? { address: loc } : { location: loc }
      );
      const destinations = options.destinations.map((loc) =>
        typeof loc === "string" ? { address: loc } : { location: loc }
      );

      const body = {
        origins,
        destinations,
        travelMode: options.travelMode || "DRIVE",
        routeModifiers: {
          avoidTolls: false,
          avoidHighways: false,
          avoidFerries: false,
        },
      };

      const response = await fetch(this.distanceMatrixUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          // Required by Distance Matrix API v2
          "X-Goog-FieldMask": [
            "originIndex",
            "destinationIndex",
            "duration",
            "distanceMeters",
            "status",
          ].join(","),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Distance Matrix API error: ${response.statusText}`);
      }

      // computeRouteMatrix returns an NDJSON stream (one JSON object per line)
      const text = await response.text();
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const elements: Array<{
        originIndex: number;
        destinationIndex: number;
        duration?: { seconds?: number };
        distanceMeters?: number;
        status?: string;
      }> = [];

      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          elements.push(obj);
        } catch {}
      }

      if (elements.length === 0) {
        return [];
      }

      const numOrigins =
        Math.max(...elements.map((e) => e.originIndex ?? 0)) + 1;
      const numDestinations =
        Math.max(...elements.map((e) => e.destinationIndex ?? 0)) + 1;

      // Initialize matrix
      const matrix: any[][] = Array.from({ length: numOrigins }, () =>
        Array.from({ length: numDestinations }, () => ({
          distance: "N/A",
          distanceMeters: 0,
          duration: "N/A",
          durationSeconds: 0,
          status: "UNKNOWN",
        }))
      );

      const toTextDistance = (meters: number) => {
        if (meters < 1000) return `${meters} m`;
        return `${(meters / 1000).toFixed(1)} km`;
      };

      const toTextDuration = (seconds: number) => {
        const mins = Math.round(seconds / 60);
        if (mins < 60) return `${mins} min`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h} h ${m} min`;
      };

      for (const el of elements) {
        const row = el.originIndex;
        const col = el.destinationIndex;
        if (row == null || col == null) continue;
        const durationSec = el.duration?.seconds || 0;
        const dist = el.distanceMeters || 0;
        matrix[row][col] = {
          distance: toTextDistance(dist),
          distanceMeters: dist,
          duration: toTextDuration(durationSec),
          durationSeconds: durationSec,
          status: el.status || "OK",
        };
      }

      return matrix;
    } catch (error) {
      console.error("RoutesService.getDistanceMatrix error:", error);
      throw error;
    }
  }

  /**
   * Helper to normalize location input (accept both strings and coordinates)
   */
  private normalizeLocation(location: RouteLocation | string): RouteLocation {
    if (typeof location === "string") {
      // For now, return a placeholder. In production, would geocode the address first
      console.warn(
        `String location "${location}" needs geocoding - returning placeholder`
      );
      return { lat: 0, lng: 0 };
    }
    return location;
  }

  /**
   * Helper to map Google Routes API response to our Route interface
   */
  private mapRoute(route: any): Route {
    const legs = (route.legs || []).map((leg: any) => ({
      startAddress: leg.startLocation?.address || "",
      endAddress: leg.endLocation?.address || "",
      distanceMeters: leg.distanceMeters || 0,
      durationSeconds: leg.duration?.seconds || 0,
      steps: (leg.steps || []).map((step: any) => ({
        instruction: step.navigationInstruction?.instructions || "",
        distanceMeters: step.distanceMeters || 0,
        durationSeconds: step.duration?.seconds || step.staticDuration?.seconds || 0,
      })),
    }));

    const totalDistance = legs.reduce((sum: number, leg: RouteLeg) => sum + leg.distanceMeters, 0);
    const totalDuration = legs.reduce((sum: number, leg: RouteLeg) => sum + leg.durationSeconds, 0);

    return {
      summary: `${Math.round(totalDistance / 1000)}km, ${Math.round(totalDuration / 60)}min`,
      legs,
      polyline: route.polyline?.encodedPolyline || "",
      distanceMeters: totalDistance,
      durationSeconds: totalDuration,
    };
  }
}
