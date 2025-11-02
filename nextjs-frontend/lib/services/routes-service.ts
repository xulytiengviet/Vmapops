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
  transitDetails?: TransitStepDetails;
  travelMode?: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";
}

export interface TransitStepDetails {
  stopDetails: {
    arrivalStop: TransitStop;
    arrivalTime: string; // ISO timestamp
    departureStop: TransitStop;
    departureTime: string; // ISO timestamp
  };
  transitLine: TransitLine;
  headsign: string;
  headway?: number; // Duration in seconds between departures
  stopCount: number;
  tripShortText?: string;
  localizedValues: {
    arrivalTime?: {
      time: string; // Localized text
      timeZone: string; // IANA timezone
    };
    departureTime?: {
      time: string; // Localized text
      timeZone: string; // IANA timezone
    };
  };
}

export interface TransitStop {
  name: string;
  location: {
    latLng: {
      latitude: number;
      longitude: number;
    };
  };
}

export interface TransitLine {
  name: string;
  nameShort: string;
  color: string;
  textColor: string;
  vehicle: TransitVehicle;
  agencies: TransitAgency[];
}

export interface TransitVehicle {
  type: "BUS" | "CABLE_CAR" | "COMMUTER_TRAIN" | "FERRY" | "FUNICULAR" | "GONDOLA_LIFT" | "HEAVY_RAIL" | "HIGH_SPEED_TRAIN" | "INTERCITY_BUS" | "LONG_DISTANCE_TRAIN" | "METRO_RAIL" | "MONORAIL" | "OTHER" | "RAIL" | "SHARE_TAXI" | "SUBWAY" | "TRAM" | "TROLLEYBUS";
  name?: string; // LocalizedText
  iconUri?: string;
  localIconUri?: string;
}

export interface TransitAgency {
  name: string;
  phoneNumber: string;
  uri: string;
}

export interface TransitFare {
  currencyCode: string;
  units: string;
  nanos: number;
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
  transitFare?: TransitFare;
  transitSteps?: TransitStepDetails[];
}

export interface DirectionsOptions {
  origin: RouteLocation | string;
  destination: RouteLocation | string;
  waypoints?: RouteLocation[]; // Intermediate stops
  travelMode?: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";
  departureTime?: string;
  alternatives?: boolean;
  optimizeWaypoints?: boolean; // Optimize waypoint order
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
      const travelMode = options.travelMode || "DRIVE";
      const isTransit = travelMode === "TRANSIT";
      
      const body: any = {
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
        travelMode: travelMode,
        computeAlternativeRoutes: options.alternatives !== false, // Default to true
        languageCode: "en-US",
        units: "METRIC",
      };

      // Add waypoints if provided (for multi-stop routes)
      if (options.waypoints && options.waypoints.length > 0) {
        body.intermediates = options.waypoints.map((wp) => {
          const normalized = this.normalizeLocation(wp);
          return {
            location: {
              latLng: {
                latitude: normalized.lat,
                longitude: normalized.lng,
              },
            },
          };
        });
        
        // Optimize waypoint order if requested (only for non-transit modes)
        if (options.optimizeWaypoints && !isTransit) {
          body.optimizeWaypointOrder = true;
        }
      }

      // TRANSIT mode requires different routing preference and doesn't support routeModifiers
      if (isTransit) {
        // For TRANSIT, use transitPreferences instead of routingPreference
        body.transitPreferences = {
          routingPreference: "LESS_WALKING", // or "FEWER_TRANSFERS"
          allowedTravelModes: ["BUS", "SUBWAY", "TRAIN", "LIGHT_RAIL", "RAIL"],
        };
      } else if (travelMode === "DRIVE") {
        // Only DRIVE mode supports routingPreference and routeModifiers
        body.routingPreference = "TRAFFIC_AWARE";
        body.routeModifiers = {
          avoidTolls: false,
          avoidHighways: false,
          avoidFerries: false,
      };
      }
      // WALK and BICYCLE modes don't support routingPreference or routeModifiers

      if (options.departureTime) {
        (body as any).departureTime = options.departureTime;
      }

      console.log('[RoutesService] Request body:', JSON.stringify(body, null, 2));

      // Build field mask - include transit details for TRANSIT mode
      const fieldMask = [
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
      ];

      // Add waypoint optimization results if waypoints are provided
      if (options.waypoints && options.waypoints.length > 0) {
        fieldMask.push("routes.optimizedIntermediateWaypointIndex");
      }

      // Add transit-specific fields for TRANSIT mode
      if (isTransit) {
        fieldMask.push(
          "routes.legs.steps.transitDetails",
          "routes.legs.steps.travelMode",
          "routes.legs.steps.transitDetails.stopDetails",
          "routes.legs.steps.transitDetails.stopDetails.arrivalStop",
          "routes.legs.steps.transitDetails.stopDetails.departureStop",
          "routes.legs.steps.transitDetails.transitLine",
          "routes.legs.steps.transitDetails.transitLine.agencies",
          "routes.legs.steps.transitDetails.transitLine.vehicle",
          "routes.legs.steps.transitDetails.localizedValues",
          "routes.legs.steps.transitDetails.headsign",
          "routes.legs.steps.transitDetails.headway",
          "routes.legs.steps.transitDetails.stopCount",
          "routes.legs.steps.transitDetails.tripShortText",
          "routes.travelAdvisory.transitFare"
        );
      }

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          // Field mask is required by Routes API v2
          "X-Goog-FieldMask": fieldMask.join(","),
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
   * Extract transit steps from route legs
   */
  private mapTransitSteps(route: any): TransitStepDetails[] {
    const transitSteps: TransitStepDetails[] = [];
    
    for (const leg of route.legs || []) {
      for (const step of leg.steps || []) {
        if (step.transitDetails) {
          const transit = step.transitDetails;
          transitSteps.push({
            stopDetails: {
              arrivalStop: {
                name: transit.stopDetails?.arrivalStop?.name || "",
                location: transit.stopDetails?.arrivalStop?.location || { latLng: { latitude: 0, longitude: 0 } },
              },
              arrivalTime: transit.stopDetails?.arrivalTime || "",
              departureStop: {
                name: transit.stopDetails?.departureStop?.name || "",
                location: transit.stopDetails?.departureStop?.location || { latLng: { latitude: 0, longitude: 0 } },
              },
              departureTime: transit.stopDetails?.departureTime || "",
            },
            transitLine: {
              name: transit.transitLine?.name || "",
              nameShort: transit.transitLine?.nameShort || transit.transitLine?.name || "",
              color: transit.transitLine?.color || "#4285F4",
              textColor: transit.transitLine?.textColor || "#FFFFFF",
              vehicle: {
                type: transit.transitLine?.vehicle?.type || "BUS",
                name: transit.transitLine?.vehicle?.name?.text || transit.transitLine?.vehicle?.name || "",
                iconUri: transit.transitLine?.vehicle?.iconUri || "",
                localIconUri: transit.transitLine?.vehicle?.localIconUri || "",
              },
              agencies: (transit.transitLine?.agencies || []).map((agency: any) => ({
                name: agency.name || "",
                phoneNumber: agency.phoneNumber || "",
                uri: agency.uri || "",
              })),
            },
            headsign: transit.headsign || "",
            headway: transit.headway?.seconds || transit.headway || undefined,
            stopCount: transit.stopCount || 0,
            tripShortText: transit.tripShortText,
            localizedValues: {
              arrivalTime: transit.localizedValues?.arrivalTime ? {
                time: transit.localizedValues.arrivalTime.time?.text || "",
                timeZone: transit.localizedValues.arrivalTime.timeZone || "",
              } : undefined,
              departureTime: transit.localizedValues?.departureTime ? {
                time: transit.localizedValues.departureTime.time?.text || "",
                timeZone: transit.localizedValues.departureTime.timeZone || "",
              } : undefined,
            },
          });
        }
      }
    }
    
    return transitSteps;
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
        transitDetails: step.transitDetails ? this.mapTransitStepDetails(step.transitDetails) : undefined,
        travelMode: step.travelMode || undefined,
      })),
    }));

    const totalDistance = legs.reduce((sum: number, leg: RouteLeg) => sum + leg.distanceMeters, 0);
    // Use route-level duration if available, otherwise sum leg durations
    const routeDuration = route.duration?.seconds || 0;
    const totalDuration = routeDuration > 0 ? routeDuration : legs.reduce((sum: number, leg: RouteLeg) => sum + leg.durationSeconds, 0);

    // Extract transit fare
    const transitFare = route.travelAdvisory?.transitFare ? {
      currencyCode: route.travelAdvisory.transitFare.currencyCode || "USD",
      units: route.travelAdvisory.transitFare.units || "0",
      nanos: route.travelAdvisory.transitFare.nanos || 0,
    } : undefined;

    // Extract transit steps
    const transitSteps = this.mapTransitSteps(route);

    return {
      summary: `${Math.round(totalDistance / 1000)}km, ${Math.round(totalDuration / 60)}min`,
      legs,
      polyline: route.polyline?.encodedPolyline || "",
      distanceMeters: totalDistance,
      durationSeconds: totalDuration,
      transitFare,
      transitSteps: transitSteps.length > 0 ? transitSteps : undefined,
    };
  }

  /**
   * Map individual transit step details
   */
  private mapTransitStepDetails(transit: any): TransitStepDetails {
    return {
      stopDetails: {
        arrivalStop: {
          name: transit.stopDetails?.arrivalStop?.name || "",
          location: transit.stopDetails?.arrivalStop?.location || { latLng: { latitude: 0, longitude: 0 } },
        },
        arrivalTime: transit.stopDetails?.arrivalTime || "",
        departureStop: {
          name: transit.stopDetails?.departureStop?.name || "",
          location: transit.stopDetails?.departureStop?.location || { latLng: { latitude: 0, longitude: 0 } },
        },
        departureTime: transit.stopDetails?.departureTime || "",
      },
      transitLine: {
        name: transit.transitLine?.name || "",
        nameShort: transit.transitLine?.nameShort || transit.transitLine?.name || "",
        color: transit.transitLine?.color || "#4285F4",
        textColor: transit.transitLine?.textColor || "#FFFFFF",
        vehicle: {
          type: transit.transitLine?.vehicle?.type || "BUS",
          name: transit.transitLine?.vehicle?.name?.text || transit.transitLine?.vehicle?.name || "",
          iconUri: transit.transitLine?.vehicle?.iconUri || "",
          localIconUri: transit.transitLine?.vehicle?.localIconUri || "",
        },
        agencies: (transit.transitLine?.agencies || []).map((agency: any) => ({
          name: agency.name || "",
          phoneNumber: agency.phoneNumber || "",
          uri: agency.uri || "",
        })),
      },
      headsign: transit.headsign || "",
      headway: transit.headway?.seconds || transit.headway || undefined,
      stopCount: transit.stopCount || 0,
      tripShortText: transit.tripShortText,
      localizedValues: {
        arrivalTime: transit.localizedValues?.arrivalTime ? {
          time: transit.localizedValues.arrivalTime.time?.text || "",
          timeZone: transit.localizedValues.arrivalTime.timeZone || "",
        } : undefined,
        departureTime: transit.localizedValues?.departureTime ? {
          time: transit.localizedValues.departureTime.time?.text || "",
          timeZone: transit.localizedValues.departureTime.timeZone || "",
        } : undefined,
      },
    };
  }
}
