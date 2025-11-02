/**
 * Get Directions Tool
 * Provides turn-by-turn navigation from origin to destination
 * Supports multiple travel modes
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { RoutesService } from "@/lib/services/routes-service";
import { GeocodingService } from "@/lib/services/geocoding-service";
import { generateDirectionInsights } from "./utils/insight-generator";
import type { CityAnalystRuntimeContext } from "../agents/cityAnalystAgent";

const getDirectionsSchema = z.object({
  origin: z
    .union([
      z.object({
      lat: z.number(),
      lng: z.number(),
      }),
      z.string(),
    ])
    .optional()
    .describe("Starting location (defaults to user's current location). Can be coordinates or place name like 'home' or 'work'"),

  destination: z
    .union([
      z.object({
      lat: z.number(),
      lng: z.number(),
      }),
      z.string(),
    ])
    .describe("Ending location. Can be coordinates or place name like 'home' or 'work'"),

  mode: z
    .enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"])
    .optional()
    .default("DRIVE")
    .describe("Travel mode: DRIVE (car), WALK (walking), BICYCLE (biking), TRANSIT (public transit: bus/train/subway). Default: DRIVE"),

  alternatives: z
    .boolean()
    .optional()
    .default(true)
    .describe("Return alternative routes (default: true to show all options)"),

  departureTime: z
    .string()
    .optional()
    .describe("ISO 8601 departure time (for real-time traffic)"),
});

const stepSchema = z.object({
  instruction: z.string(),
  distanceMeters: z.number(),
  durationSeconds: z.number(),
});

const legSchema = z.object({
  startAddress: z.string(),
  endAddress: z.string(),
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  steps: z.array(stepSchema),
});

const routeSchema = z.object({
  summary: z.string(),
  legs: z.array(legSchema),
  polyline: z.string(),
  distanceMeters: z.number(),
  durationSeconds: z.number(),
});

const getDirectionsOutputSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      routes: z.array(routeSchema),
      metadata: z.object({
        mode: z.string(),
        routeCount: z.number(),
        primaryRoute: z.number(),
      }),
      insights: z.object({
        summary: z.string(),
        highlights: z.array(z.string()),
        suggestions: z.array(z.string()),
      }),
      mapCommands: z.array(
        z.object({
          type: z.enum(["CLEAR_ROUTES", "DRAW_ROUTE", "PAN_TO"]),
          payload: z.any().optional(),
        })
      ),
    })
    .optional(),
  error: z.string().optional(),
});

export const getDirections = createTool({
  id: "get-directions",
  description: `
    Get turn-by-turn directions from origin to destination with multiple travel modes.

    Supports:
    - Multiple travel modes: DRIVE (car), WALK (walking), BICYCLE (biking), TRANSIT (public transit: bus/train/subway)
    - Alternative routes are enabled by default (alternatives: true) to show all route options
    - Real-time traffic for driving routes (set departureTime)
    - Transit preferences for public transit routes

    Returns: Multiple routes with distinct colors (Blue=recommended, Green/Yellow/Red/Purple/Cyan=alternatives), each with steps, distances, durations, and polylines for map visualization

    Use when: 
    - User asks "how do I get to X?", "directions to Y", "route from A to B"
    - User specifies travel mode: "by car", "by bike", "by train", "by bus", "walking", etc.
    - Always request alternatives to show multiple route options
  `,
  inputSchema: getDirectionsSchema,
  outputSchema: getDirectionsOutputSchema,

  execute: async ({ context, runtimeContext, writer: _writer }) => {
    try {
      const service = new RoutesService();
      const geocodingService = new GeocodingService();

      // Helper to calculate distance between two coordinates (Haversine formula)
      const calculateDistance = (loc1: { lat: number; lng: number }, loc2: { lat: number; lng: number }): number => {
        const R = 6371; // Earth's radius in km
        const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
        const dLng = (loc2.lng - loc1.lng) * Math.PI / 180;
        const a = 
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in km
      };

      // Helper to resolve location from string or coordinates
      const resolveLocation = async (
        input: { lat: number; lng: number } | string | undefined,
        defaultLocation?: { lat: number; lng: number }
      ): Promise<{ lat: number; lng: number } | null> => {
        // If undefined, return default
        if (!input) return defaultLocation || null;

        // If already coordinates, return as-is
        if (typeof input === 'object' && 'lat' in input && 'lng' in input) {
          return input;
        }

        // If string, check saved places first
        if (typeof input === 'string') {
          const savedPlaces = runtimeContext?.get("savedPlaces") as Record<string, { location: { lat: number; lng: number }; name: string; address: string }> | undefined;
          const normalizedName = input.toLowerCase().trim();
          
          // Check saved places
          if (savedPlaces) {
            if (normalizedName === 'home' && savedPlaces.home) {
              // Check if saved home is far from current location
              const currentLocation = userLocation || defaultLocation;
              if (currentLocation) {
                const distanceKm = calculateDistance(currentLocation, savedPlaces.home.location);
                // If home is more than 100km away, it's likely wrong (user might be traveling)
                if (distanceKm > 100) {
                  console.warn(`[get-directions] Saved home (${savedPlaces.home.address}) is ${distanceKm.toFixed(1)}km away from current location. Using current location instead.`);
                  return currentLocation;
                }
              }
              console.log(`[get-directions] Resolved "${input}" to saved home: ${savedPlaces.home.name}`);
              return savedPlaces.home.location;
            }
            if (normalizedName === 'work' && savedPlaces.work) {
              const currentLocation = userLocation || defaultLocation;
              if (currentLocation) {
                const distanceKm = calculateDistance(currentLocation, savedPlaces.work.location);
                if (distanceKm > 100) {
                  console.warn(`[get-directions] Saved work (${savedPlaces.work.address}) is ${distanceKm.toFixed(1)}km away from current location. Using current location instead.`);
                  return currentLocation;
                }
              }
              console.log(`[get-directions] Resolved "${input}" to saved work: ${savedPlaces.work.name}`);
              return savedPlaces.work.location;
            }
            if (savedPlaces[normalizedName]) {
              console.log(`[get-directions] Resolved "${input}" to saved favorite: ${savedPlaces[normalizedName].name}`);
              return savedPlaces[normalizedName].location;
            }
          }

          // If not found in saved places, geocode it
          console.log(`[get-directions] Geocoding "${input}"...`);
          const geocodeResults = await geocodingService.geocode(input);
          if (geocodeResults && geocodeResults.length > 0) {
            return geocodeResults[0].location;
          }
        }

        return null;
      };

      // Try to get user location from RuntimeContext as fallback for origin
      const userLocation = runtimeContext?.get("userLocation") as CityAnalystRuntimeContext["userLocation"];
      
      // Resolve origin (can be string like "home" or coordinates)
      const origin = await resolveLocation(context.origin, userLocation);

      if (!origin) {
        return {
          success: false,
          error: "Origin location is required. Provide origin parameter or ensure user location is available.",
        };
      }

      // Resolve destination (can be string like "home" or coordinates)
      const destination = await resolveLocation(context.destination);

      if (!destination) {
        return {
          success: false,
          error: "Could not resolve destination location. Please provide a valid address or place name.",
        };
      }

      // Log RuntimeContext usage for debugging
      if (!context.origin && userLocation) {
        console.log("[get-directions] Using origin from RuntimeContext:", userLocation);
      }
      
      // Get directions
      const routes = await service.getDirections({
        origin: origin,
        destination: destination,
        travelMode: context.mode,
        departureTime: context.departureTime,
        alternatives: context.alternatives,
      });

      if (!routes || routes.length === 0) {
        return {
          success: false,
          error: "No route found",
        };
      }

      // Log transit data for verification (P0: Transit enrichment)
      if (context.mode === "TRANSIT") {
        console.log("[get-directions] Transit routes received:", routes.length);
        routes.forEach((route, idx) => {
          console.log(`[get-directions] Route ${idx + 1}:`, {
            distance: `${(route.distanceMeters / 1000).toFixed(1)}km`,
            duration: `${Math.round(route.durationSeconds / 60)}min`,
            fare: route.transitFare ? `${route.transitFare.currencyCode} ${(parseInt(route.transitFare.units || '0') + (route.transitFare.nanos || 0) / 1000000000).toFixed(2)}` : 'N/A',
            transitSteps: route.transitSteps?.map((step: any) => ({
              line: step.transitLine?.nameShort || step.transitLine?.name,
              vehicle: step.transitLine?.vehicle?.type,
              headsign: step.headsign,
              stops: step.stopCount,
              departure: step.localizedValues?.departureTime?.time,
              arrival: step.localizedValues?.arrivalTime?.time,
            })) || [],
          });
        });
      }

      // Find fastest route as primary
      const primaryRoute = routes.reduce((minRoute, route) =>
        route.durationSeconds < minRoute.durationSeconds ? route : minRoute
      );
      const primaryIdx = routes.indexOf(primaryRoute);

      // Generate insights
      const insights = generateDirectionInsights(primaryRoute);

      // Build map commands
      const mapCommands: Array<{ type: "CLEAR_ROUTES" | "DRAW_ROUTE" | "PAN_TO"; payload: any }> = [];

      // Clear old routes before showing new ones
      mapCommands.push({
        type: "CLEAR_ROUTES",
        payload: {},
      });

      // Color palette for different routes (distinct colors for each alternative)
      const routeColors = [
        "#4285F4", // Blue - primary route
        "#34A853", // Green - alternative 1
        "#FBBC04", // Yellow - alternative 2
        "#EA4335", // Red - alternative 3
        "#9C27B0", // Purple - alternative 4
        "#00BCD4", // Cyan - alternative 5
      ];

      // Draw all routes with distinct colors
      routes.forEach((route, index) => {
        const isPrimary = index === primaryIdx;
        if (route.polyline) {
          const color = routeColors[index % routeColors.length];
          mapCommands.push({
            type: "DRAW_ROUTE",
            payload: {
              polyline: route.polyline,
              color: color,
              weight: isPrimary ? 4 : 3, // Thicker for primary
              opacity: isPrimary ? 0.9 : 0.7, // More opaque for primary, but still visible for alternatives
              metadata: {
                routeIndex: index,
                isPrimary: isPrimary,
                distance: route.distanceMeters,
                duration: route.durationSeconds,
                travelMode: context.mode,
                routeLabel: isPrimary ? "Recommended" : `Option ${index + 1}`,
                // Include transit information if available
                transitFare: route.transitFare,
                transitSteps: route.transitSteps,
              },
            },
          });
        }
      });

      // Pan to origin
      mapCommands.push({
        type: "PAN_TO",
        payload: origin,
      });

      // Note: Removed second incorrect writer.write() call
      // Progress updates should use proper AI SDK streaming format or be omitted

      return {
        success: true,
        data: {
          routes,
          metadata: {
            mode: context.mode,
            routeCount: routes.length,
            primaryRoute: primaryIdx,
          },
          insights,
          mapCommands,
        },
      };
    } catch (error) {
      console.error("get-directions tool error:", error);
      return {
        success: false,
        error: `Directions failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});
