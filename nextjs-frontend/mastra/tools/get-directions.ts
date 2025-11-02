/**
 * Get Directions Tool
 * Provides turn-by-turn navigation from origin to destination
 * Supports multiple travel modes
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { RoutesService } from "@/lib/services/routes-service";
import { formatDistance, formatDuration } from "./utils/distance-calculator";
import { generateDirectionInsights } from "./utils/insight-generator";
import type { CityAnalystRuntimeContext } from "../agents/cityAnalystAgent";

const getDirectionsSchema = z.object({
  origin: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional()
    .describe("Starting location (defaults to user's current location)"),

  destination: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .describe("Ending location"),

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
          type: z.enum(["DRAW_ROUTE", "PAN_TO"]),
          payload: z.any(),
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

  execute: async ({ context, runtimeContext, writer }) => {
    try {
      const service = new RoutesService();

      // Try to get user location from RuntimeContext as fallback for origin
      const userLocation = runtimeContext?.get("userLocation") as CityAnalystRuntimeContext["userLocation"];
      
      // Use tool parameter OR fallback to RuntimeContext for origin
      const origin = context.origin || userLocation;

      if (!origin) {
        return {
          success: false,
          error: "Origin location is required. Provide origin parameter or ensure user location is available.",
        };
      }

      // Log RuntimeContext usage for debugging
      if (!context.origin && userLocation) {
        console.log("[get-directions] Using origin from RuntimeContext:", userLocation);
      }

      // Note: Removed incorrect writer.write() call that was causing AI SDK validation error
      // The writer should use text-start/text-delta/text-end or custom data parts
      const modeText = context.mode.toLowerCase();
      
      // Get directions
      const routes = await service.getDirections({
        origin: origin,
        destination: context.destination,
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

      // Find fastest route as primary
      const primaryRoute = routes.reduce((minRoute, route) =>
        route.durationSeconds < minRoute.durationSeconds ? route : minRoute
      );
      const primaryIdx = routes.indexOf(primaryRoute);

      // Generate insights
      const insights = generateDirectionInsights(primaryRoute);

      // Build map commands
      const mapCommands: Array<{ type: "DRAW_ROUTE" | "PAN_TO"; payload: any }> = [];

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
