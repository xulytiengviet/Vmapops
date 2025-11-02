/**
 * Search Along Route Tool
 * Finds places along a travel route with minimal detour
 * Integrates with Google Places API and vibe analysis
 */

import { createTool } from "@mastra/core";
import { z } from "zod";
import { SearchAlongRouteService, PlaceAlongRoute } from "@/lib/services/search-along-route";

export const searchAlongRoute = createTool({
  id: "search-along-route",
  name: "Search Along Route",
  description: `Search for places along a travel route with minimal detour.
    Perfect for finding restaurants, gas stations, or attractions along your journey.
    Supports vibe-based semantic filtering (e.g., "quiet", "romantic", "family-friendly").
    Returns places sorted by combined score of detour distance and semantic match.`,

  inputSchema: z.object({
    routePolyline: z.string().optional().describe("Encoded polyline from Routes API"),
    origin: z
      .object({
        lat: z.number().describe("Origin latitude"),
        lng: z.number().describe("Origin longitude"),
      })
      .optional()
      .describe("Starting point of the route"),
    destination: z
      .object({
        lat: z.number().describe("Destination latitude"),
        lng: z.number().describe("Destination longitude"),
      })
      .optional()
      .describe("End point of the route"),
    query: z.string().describe("What to search for (e.g., 'coffee', 'gas station', 'restaurant')"),
    semanticAttributes: z
      .array(z.string())
      .optional()
      .describe("Vibe attributes for semantic filtering (e.g., ['quiet', 'cozy', 'fast service'])"),
    maxDetourMeters: z
      .number()
      .optional()
      .describe("Maximum detour distance in meters (default: 500)"),
    maxDetourPercent: z
      .number()
      .optional()
      .describe("Maximum detour as percentage of route (default: 10)"),
    radius: z
      .number()
      .optional()
      .describe("Search radius around route in meters (default: 1000)"),
    minRating: z
      .number()
      .min(0)
      .max(5)
      .optional()
      .describe("Minimum place rating (0-5)"),
    openNow: z.boolean().optional().describe("Only return places that are currently open"),
    maxResults: z
      .number()
      .optional()
      .describe("Maximum number of results (default: 20)"),
  }),

  execute: async (context: any) => {
    console.log("[search-along-route] Starting route-based search");

    try {
      const searchService = new SearchAlongRouteService();

      // Validate input - need either polyline or origin/destination
      if (!context.routePolyline && (!context.origin || !context.destination)) {
        return {
          success: false,
          error: "Provide either 'routePolyline' or both 'origin' and 'destination' coordinates",
        };
      }

      // If no polyline but have origin/destination, get route first
      let polyline = context.routePolyline;

      if (!polyline && context.origin && context.destination) {
        console.log("[search-along-route] Fetching route polyline from origin to destination");

        const { RoutesService } = await import("@/lib/services/routes-service");
        const routesService = new RoutesService();

        const routeResult = await routesService.getDirections({
          origin: context.origin,
          destination: context.destination,
          travelMode: 'DRIVE',
        });

        if (!routeResult || routeResult.length === 0) {
          return {
            success: false,
            error: "Could not find a route between the specified origin and destination",
          };
        }

        // Extract polyline from the route
        polyline = routeResult[0].polyline;

        if (!polyline) {
          console.warn("[search-along-route] No polyline in route response, using waypoints");
          // Fallback: use route points if available
          const routePoints = [];
          for (const leg of routeResult[0].legs) {
            for (const step of leg.steps) {
              // Note: RouteStep doesn't have startLocation, we'll need to handle this differently
              // For now, return error if no polyline
              console.error("[search-along-route] Unable to extract route points without polyline");
              break;
            }
          }

          if (routePoints.length < 2) {
            return {
              success: false,
              error: "Could not extract route points from the navigation data",
            };
          }

          // Use route points directly instead of polyline
          const results = await searchService.searchAlongRoute({
            routePoints,
            query: context.query,
            semanticAttributes: context.semanticAttributes,
            maxDetourMeters: context.maxDetourMeters,
            maxDetourPercent: context.maxDetourPercent,
            radius: context.radius,
            minRating: context.minRating,
            openNow: context.openNow,
            maxResults: context.maxResults,
          });

          return formatResults(results, context.semanticAttributes);
        }
      }

      // Execute search along route
      const results = await searchService.searchAlongRoute({
        routePolyline: polyline,
        query: context.query,
        semanticAttributes: context.semanticAttributes,
        maxDetourMeters: context.maxDetourMeters,
        maxDetourPercent: context.maxDetourPercent,
        radius: context.radius,
        minRating: context.minRating,
        openNow: context.openNow,
        maxResults: context.maxResults,
      });

      return formatResults(results, context.semanticAttributes);
    } catch (error) {
      console.error("[search-along-route] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to search along route",
      };
    }
  },

  outputSchema: z.union([
    z.object({
      success: z.literal(true),
      places: z.array(
        z.object({
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
          // Route-specific fields
          detourMeters: z.number(),
          detourMinutes: z.number(),
          detourPercent: z.number(),
          isOnRoute: z.boolean(),
          originalRouteMinutes: z.number(),
          newRouteMinutes: z.number(),
          // Semantic fields
          semanticScore: z.number().optional(),
          semanticAttributes: z
            .record(
              z.string(),
              z.object({
                score: z.number(),
                count: z.number(),
                evidence: z.array(z.string()),
              })
            )
            .optional(),
        })
      ),
      summary: z.object({
        totalFound: z.number(),
        averageDetour: z.number(),
        placesOnRoute: z.number(),
        bestMatch: z.string().optional(),
      }),
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
    }),
  ]),
});

/**
 * Format results for output
 */
function formatResults(
  results: PlaceAlongRoute[],
  semanticAttributes?: string[]
): any {
  if (results.length === 0) {
    return {
      success: true,
      places: [],
      summary: {
        totalFound: 0,
        averageDetour: 0,
        placesOnRoute: 0,
      },
    };
  }

  // Calculate summary statistics
  const totalDetour = results.reduce((sum, p) => sum + p.detourMeters, 0);
  const averageDetour = Math.round(totalDetour / results.length);
  const placesOnRoute = results.filter(p => p.isOnRoute).length;

  // Find best semantic match if applicable
  let bestMatch: string | undefined;
  if (semanticAttributes && semanticAttributes.length > 0) {
    const bestPlace = results.reduce((best, current) => {
      const currentScore = current.semanticScore || 0;
      const bestScore = best.semanticScore || 0;
      return currentScore > bestScore ? current : best;
    }, results[0]);

    if (bestPlace.semanticScore && bestPlace.semanticScore > 0.5) {
      bestMatch = bestPlace.name;
    }
  }

  return {
    success: true,
    places: results.map((place) => ({
      placeId: place.placeId,
      name: place.name,
      address: place.address,
      location: place.location,
      rating: place.rating,
      userRatingsTotal: place.userRatingsTotal,
      priceLevel: place.priceLevel,
      openNow: place.openNow,
      types: place.types,
      // Route info
      detourMeters: Math.round(place.detourMeters),
      detourMinutes: place.detourMinutes,
      detourPercent: Math.round(place.detourPercent * 10) / 10,
      isOnRoute: place.isOnRoute,
      originalRouteMinutes: place.originalRouteMinutes,
      newRouteMinutes: place.newRouteMinutes,
      // Semantic info
      semanticScore: place.semanticScore,
      semanticAttributes: place.semanticAttributes,
    })),
    summary: {
      totalFound: results.length,
      averageDetour,
      placesOnRoute,
      bestMatch,
    },
  };
}