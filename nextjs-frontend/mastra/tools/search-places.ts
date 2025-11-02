/**
 * Search Places Tool
 * Unified tool for searching places by text or nearby location
 * Used by Mastra agents to find businesses, landmarks, etc.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { PlacesService } from "@/lib/services/places-service";
import {
  calculateDistance,
  estimateWalkingTime,
  detectDensity,
} from "./utils/distance-calculator";
import { generatePlaceInsights } from "./utils/insight-generator";

const searchPlaceSchema = z.object({
  // Either query (text search) or location + type (nearby search)
  query: z.string().optional().describe("Text search query (e.g., 'coffee', 'Italian restaurant')"),

  location: z
    .object({
      lat: z.number().describe("Latitude"),
      lng: z.number().describe("Longitude"),
    })
    .optional()
    .describe("Center point for nearby search"),

  type: z
    .string()
    .optional()
    .describe("Place type for nearby search (e.g., 'cafe', 'restaurant', 'park')"),

  radius: z
    .number()
    .optional()
    .default(1000)
    .describe("Search radius in meters (default: 1000m)"),

  minRating: z
    .number()
    .min(0)
    .max(5)
    .optional()
    .describe("Minimum rating filter (0-5)"),

  openNow: z
    .boolean()
    .optional()
    .describe("Only include currently open places"),

  maxResults: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum results to return (default: 10)"),
});

const placeSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  address: z.string(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  rating: z.number().optional(),
  userRatingsTotal: z.number().optional(),
  priceLevel: z.number().optional(),
  openNow: z.boolean().optional(),
  types: z.array(z.string()),
  distanceMeters: z.number().optional(),
  walkingTimeMinutes: z.number().optional(),
});

const searchPlacesOutputSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      places: z.array(placeSchema),
      metadata: z.object({
        query: z.string().optional(),
        searchType: z.enum(["text", "nearby"]),
        resultCount: z.number(),
        searchRadius: z.number().optional(),
        density: z.enum(["sparse", "moderate", "dense"]),
      }),
      insights: z.object({
        summary: z.string(),
        highlights: z.array(z.string()),
        suggestions: z.array(z.string()),
        warnings: z.array(z.string()).optional(),
      }),
      mapCommands: z.array(
        z.object({
          type: z.enum(["SHOW_ON_MAP", "PAN_TO"]),
          payload: z.any(),
        })
      ),
    })
    .optional(),
  error: z.string().optional(),
});

export const searchPlaces = createTool({
  id: "search-places",
  description: `
    Search for places using text query or nearby location.

    Supports two modes:
    1. Text search: Provide 'query' (e.g., "coffee shops", "Italian restaurants")
    2. Nearby search: Provide 'location' + optional 'type' (e.g., location + type="cafe")

    Returns: Places with name, location, rating, distance, and walking time

    Use when: User asks "find coffee", "what's nearby", "restaurants around me"
  `,
  inputSchema: searchPlaceSchema,
  outputSchema: searchPlacesOutputSchema,

  execute: async ({ context, writer }) => {
    try {
      const service = new PlacesService();

      // Determine search mode
      const isTextSearch = !!context.query && !context.location;
      const isNearbySearch = !!context.location && !context.query;

      if (!isTextSearch && !isNearbySearch) {
        return {
          success: false,
          error:
            "Provide either 'query' (for text search) or 'location' (for nearby search)",
        };
      }

      // Emit initial status
      await writer?.write({
        type: "text",
        text: isTextSearch
          ? `Searching for "${context.query}"...`
          : `Searching for ${context.type || "places"} near your location...`,
      });

      let results: any[] = [];

      if (isTextSearch) {
        // Text search mode
        results = await service.textSearch(context.query!, {
          location: context.location,
          radius: context.radius,
          minRating: context.minRating,
          maxResults: context.maxResults,
        });
      } else {
        // Nearby search mode
        results = await service.nearbySearch({
          location: context.location!,
          type: context.type,
          radius: context.radius,
          minRating: context.minRating,
          openNow: context.openNow,
          maxResults: context.maxResults,
        });
      }

      // Enrich results with distance and walking time
      const enriched = results.map((place) => {
        const distance = context.location
          ? calculateDistance(context.location, place.location)
          : undefined;
        const walkingTime = distance ? estimateWalkingTime(distance) : undefined;

        return {
          ...place,
          distanceMeters: distance,
          walkingTimeMinutes: walkingTime,
        };
      });

      // Sort by distance if nearby search
      if (isNearbySearch) {
        enriched.sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
      }

      // Generate insights
      const searchType: "text" | "nearby" = isTextSearch ? "text" : "nearby";
      const insights = generatePlaceInsights(
        enriched,
        context.query || context.type || "places"
      );

      // Build map commands
      const mapCommands: Array<{ type: "SHOW_ON_MAP" | "PAN_TO"; payload: any }> = [];

      if (enriched.length > 0) {
        // Add markers for first 10 results
        const markersToShow = enriched.slice(0, 10);
        mapCommands.push({
          type: "SHOW_ON_MAP",
          payload: {
            markers: markersToShow.map((place) => ({
              id: place.placeId,
              position: place.location,
              title: place.name,
              type: "place",
              metadata: place,
            })),
          },
        });

        // Pan to first result
        mapCommands.push({
          type: "PAN_TO",
          payload: enriched[0].location,
        });
      }

      return {
        success: true,
        data: {
          places: enriched,
          metadata: {
            query: context.query,
            searchType,
            resultCount: enriched.length,
            searchRadius: context.radius,
            density: detectDensity(enriched.length),
          },
          insights,
          mapCommands,
        },
      };
    } catch (error) {
      console.error("search-places tool error:", error);
      return {
        success: false,
        error: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});
