/**
 * Calculate Distance Matrix Tool
 * Computes distances and travel times between multiple origins and destinations
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { RoutesService } from "@/lib/services/routes-service";
import { generateDistanceMatrixInsights } from "./utils/insight-generator";
import type { CityAnalystRuntimeContext } from "../agents/cityAnalystAgent";

const calculateDistanceMatrixSchema = z.object({
  origins: z
    .array(
      z.object({
        lat: z.number(),
        lng: z.number(),
      })
    )
    .describe("Starting points"),

  destinations: z
    .array(
      z.object({
        lat: z.number(),
        lng: z.number(),
      })
    )
    .describe("Ending points"),

  mode: z
    .enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"])
    .optional()
    .default("DRIVE")
    .describe("Travel mode"),
});

const distanceElementSchema = z.object({
  distance: z.string(),
  distanceMeters: z.number(),
  duration: z.string(),
  durationSeconds: z.number(),
  status: z.string(),
});

const calculateDistanceMatrixOutputSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      matrix: z.array(z.array(distanceElementSchema)),
      insights: z.object({
        summary: z.string(),
        highlights: z.array(z.string()),
        suggestions: z.array(z.string()),
      }),
    })
    .optional(),
  error: z.string().optional(),
});

export const calculateDistanceMatrix = createTool({
  id: "calculate-distance-matrix",
  description: `
    Calculate distances and travel times between multiple points.

    Returns: 2D matrix of distances and durations from each origin to each destination

    Use when: User needs to compare travel times from multiple locations, find closest destination, etc.
  `,
  inputSchema: calculateDistanceMatrixSchema,
  outputSchema: calculateDistanceMatrixOutputSchema,

  execute: async ({ context, runtimeContext }) => {
    try {
      const service = new RoutesService();

      // Try to get user location from RuntimeContext as fallback for origins
      const userLocation = runtimeContext?.get("userLocation") as CityAnalystRuntimeContext["userLocation"];
      
      // If origins is empty and userLocation exists, use it as the only origin
      const origins = context.origins.length > 0 ? context.origins : (userLocation ? [userLocation] : []);

      if (origins.length === 0) {
        return {
          success: false,
          error: "At least one origin is required. Provide origins parameter or ensure user location is available.",
        };
      }

      // Log RuntimeContext usage for debugging
      if (context.origins.length === 0 && userLocation) {
        console.log("[calculate-distance-matrix] Using origin from RuntimeContext:", userLocation);
      }

      // Note: Removed incorrect writer.write() call that was causing AI SDK validation error
      // The writer should use text-start/text-delta/text-end or custom data parts

      const matrix = await service.getDistanceMatrix({
        origins: origins,
        destinations: context.destinations,
        travelMode: context.mode,
      });

      if (!matrix || matrix.length === 0) {
        return {
          success: false,
          error: "Could not calculate distance matrix",
        };
      }

      // Generate insights
      const insights = generateDistanceMatrixInsights(
        matrix,
        context.origins.length,
        context.destinations.length
      );

      return {
        success: true,
        data: {
          matrix,
          insights,
        },
      };
    } catch (error) {
      console.error("calculate-distance-matrix tool error:", error);
      return {
        success: false,
        error: `Distance matrix calculation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});
