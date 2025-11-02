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

      const body = {
        origin: { location: origin },
        destination: { location: destination },
        travelMode: options.travelMode || "DRIVE",
        routeModifiers: {
          avoidTolls: false,
          avoidHighways: false,
          avoidFerries: false,
        },
        computeAlternativeRoutes: options.alternatives || false,
      };

      if (options.departureTime) {
        (body as any).departureTime = options.departureTime;
      }

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Routes API error: ${response.statusText}`);
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
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Distance Matrix API error: ${response.statusText}`);
      }

      const data = await response.json();

      // Map results to 2D array
      return (data.rows || []).map((row: any) =>
        (row.elements || []).map((element: any) => ({
          distance: element.distance?.text || "N/A",
          distanceMeters: element.distance?.value || 0,
          duration: element.duration?.text || "N/A",
          durationSeconds: element.duration?.value || 0,
          status: element.status,
        }))
      );
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
        durationSeconds: step.duration?.seconds || 0,
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
