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

const getDirectionsSchema = z.object({
  origin: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .describe("Starting location"),

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
    .describe("Travel mode (default: DRIVE)"),

  alternatives: z
    .boolean()
    .optional()
    .default(false)
    .describe("Return alternative routes"),

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
    Get turn-by-turn directions from origin to destination.

    Supports:
    - Multiple travel modes: DRIVE, WALK, BICYCLE, TRANSIT
    - Alternative routes (set alternatives: true)
    - Real-time traffic (set departureTime)

    Returns: Routes with steps, distances, durations, and polylines for map visualization

    Use when: User asks "how do I get to", "directions to", "route from A to B"
  `,
  inputSchema: getDirectionsSchema,
  outputSchema: getDirectionsOutputSchema,

  execute: async ({ context, writer }) => {
    try {
      const service = new RoutesService();

      // Emit initial status
      const modeText = context.mode.toLowerCase();
      await writer?.write({
        type: "text",
        text: `Finding ${modeText} directions...`,
      });

      // Get directions
      const routes = await service.getDirections({
        origin: context.origin,
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

      // Draw all routes - primary in blue, alternatives in gray
      routes.forEach((route, index) => {
        const isPrimary = index === primaryIdx;
        if (route.polyline) {
          mapCommands.push({
            type: "DRAW_ROUTE",
            payload: {
              polyline: route.polyline,
              color: isPrimary ? "#4285F4" : "#9CA3AF", // Blue for primary, gray for alternatives
              weight: isPrimary ? 4 : 2, // Thicker for primary
              opacity: isPrimary ? 0.9 : 0.5, // More opaque for primary
              metadata: {
                routeIndex: index,
                isPrimary: isPrimary,
                distance: route.distanceMeters,
                duration: route.durationSeconds,
              },
            },
          });
        }
      });

      // Pan to origin
      mapCommands.push({
        type: "PAN_TO",
        payload: context.origin,
      });

      // Emit progress
      await writer?.write({
        type: "text",
        text: `Route found: ${formatDistance(primaryRoute.distanceMeters)} in ${formatDuration(primaryRoute.durationSeconds)}`,
      });

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
