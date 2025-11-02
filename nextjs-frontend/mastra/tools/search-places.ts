/**
 * Search Places Tool
 * Unified tool for searching places by text or nearby location
 * Used by Mastra agents to find businesses, landmarks, etc.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { PlacesService } from "@/lib/services/places-service";
import { RoutesService } from "@/lib/services/routes-service";
import { SemanticReviewAnalyzer } from "@/lib/services/semantic-review-analyzer";
import {
  detectDensity,
} from "./utils/distance-calculator";
import { generatePlaceInsights } from "./utils/insight-generator";
import type { CityAnalystRuntimeContext } from "../agents/cityAnalystAgent";

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

  semanticAttributes: z
    .array(z.string())
    .optional()
    .describe("Semantic attributes to filter/rank by (e.g., ['quiet', 'power outlets', 'halal']). Agent should extract these naturally from user queries like 'quiet coffee shops' or 'halal biryani restaurant'."),

  travelMode: z
    .enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"])
    .optional()
    .default("WALK")
    .describe("Travel mode for distance/time calculations (default: WALK). Use DRIVE for driving distance, WALK for walking, BICYCLE for cycling, TRANSIT for public transit."),
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
  semanticAttributes: z.record(z.object({
    score: z.number(),
    count: z.number(),
    evidence: z.array(z.string()),
  })).optional(),
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
          type: z.enum(["CLEAR_MARKERS", "SHOW_ON_MAP", "PAN_TO"]),
          payload: z.any().optional(),
        })
      ),
    })
    .optional(),
  error: z.string().optional(),
});

export const searchPlaces = createTool({
  id: "search-places",
  description: `
    Comprehensive place search using Google Places API with intelligent understanding.
    
    IMPORTANT: The LLM should intelligently determine the best search approach based on user intent:
    
    APPROACH SELECTION:
    - For specific business names (e.g., "Blue Bottle Coffee", "Starbucks") → Use 'query' parameter with text search
    - For categories (e.g., "coffee shops", "restaurants") → Use 'query' parameter for broader results
    - For "nearby" requests → Ensure location is used (will use user's location automatically)
    
    EXAMPLES TO GUIDE DECISIONS:
    - "Find coffee shops" → query="coffee shops" (Google understands this naturally)
    - "Blue Bottle Coffee" → query="Blue Bottle Coffee" (searches for specific place)
    - "cafes nearby" → query="cafes" with user location
    - "Italian restaurants" → query="Italian restaurants"
    - "quiet coffee shops" → query="coffee shops", semanticAttributes=["quiet"]
    - "halal biryani restaurant" → query="biryani restaurant", semanticAttributes=["halal", "biryani"]
    - "cafe with power outlets" → query="cafe", semanticAttributes=["power outlets"]
    
    SEMANTIC FILTERING:
    - Extract ANY descriptive qualities/features from user queries as semanticAttributes (e.g., "quiet", "power outlets", "halal", "pet-friendly", "24-hour", "live music", etc.)
    - The tool analyzes reviews using AI to score relevance and rank results
    - Examples are just patterns - handle ANY semantic attribute naturally
    
    The tool will automatically try multiple search strategies and merge results for best coverage.
    
    Returns: Places with name, location, rating, distance, and walking time
    Shows markers on map automatically when places are found.
  `,
  inputSchema: searchPlaceSchema,
  outputSchema: searchPlacesOutputSchema,

  execute: async ({ context, runtimeContext, writer }) => {
    try {
      const service = new PlacesService();
      const routesService = new RoutesService();

      // Try to get user location from RuntimeContext as fallback
      const userLocation = runtimeContext?.get("userLocation") as CityAnalystRuntimeContext["userLocation"];
      
      // Use tool parameter OR fallback to RuntimeContext
      const searchLocation = context.location || userLocation;

      // Log RuntimeContext usage for debugging
      if (!context.location && userLocation) {
        console.log("[search-places] Using location from RuntimeContext:", userLocation);
      }

      let results: any[] = [];
      const processedPlaceIds = new Set<string>();

      // HYBRID SEARCH STRATEGY - Try multiple approaches for best results
      
      // 1. If we have a query, always try text search first
      if (context.query) {
        console.log(`[search-places] Trying text search for: "${context.query}"`);
        try {
          const textResults = await service.textSearch(context.query, {
            location: searchLocation,
            radius: context.radius || 2000,
            maxResults: context.maxResults || 20,
          });
          
          console.log(`[search-places] Text search returned ${textResults.length} results`);
          
          // Add unique results
          textResults.forEach(place => {
            if (!processedPlaceIds.has(place.placeId)) {
              results.push(place);
              processedPlaceIds.add(place.placeId);
            }
          });
        } catch (error) {
          console.warn("[search-places] Text search failed:", error);
        }
      }

      // 2. If we have location, also try nearby search with the query as keyword
      // This catches places that might be missed by text search
      if (searchLocation && (context.query || context.type)) {
        const keyword = context.query || context.type;
        console.log(`[search-places] Trying nearby search with keyword: "${keyword}"`);
        
        try {
          const nearbyResults = await service.nearbySearch({
            location: searchLocation,
            type: keyword, // This will be used as 'keyword' parameter now
            radius: context.radius || 1500,
            minRating: context.minRating,
            openNow: context.openNow,
            maxResults: context.maxResults || 20,
          });
          
          console.log(`[search-places] Nearby search returned ${nearbyResults.length} results`);
          
          // Merge unique results
          nearbyResults.forEach(place => {
            if (!processedPlaceIds.has(place.placeId)) {
              results.push(place);
              processedPlaceIds.add(place.placeId);
            }
          });
        } catch (error) {
          console.warn("[search-places] Nearby search failed:", error);
        }
      }

      // If no results from either search, return error
      if (results.length === 0) {
        // If we have no query and no location, that's a user error
        if (!context.query && !searchLocation) {
          return {
            success: false,
            error: "Provide either 'query' for text search or ensure location is available for nearby search.",
          };
        }
        
        // Otherwise, no results found
        return {
          success: false,
          error: `No places found for "${context.query || context.type || 'your search'}". Try different search terms or check your location.`,
        };
      }

      // PHASE 1: Enrich with DistanceMatrix API (mode-aware distances)
      let enriched: any[] = [];
      const travelMode = context.travelMode || "WALK";
      
      if (searchLocation && results.length > 0) {
        console.log(`[search-places] Calculating distances using DistanceMatrix API (mode: ${travelMode})`);
        try {
          // Use DistanceMatrix API for accurate, mode-aware distances
          const origins = [searchLocation];
          const destinations = results.map(p => p.location);
          
          const matrix = await routesService.getDistanceMatrix({
            origins,
            destinations,
            travelMode: travelMode as "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT",
          });

          // Map matrix results to places
          enriched = results.map((place, idx) => {
            const matrixCell = matrix[0]?.[idx];
            const distanceMeters = matrixCell?.distanceMeters || 0;
            const durationSeconds = matrixCell?.durationSeconds || 0;
            const durationMinutes = Math.round(durationSeconds / 60);

            return {
              ...place,
              distanceMeters,
              walkingTimeMinutes: durationMinutes, // Keep name for backward compatibility
              travelTimeMinutes: durationMinutes, // More accurate name
              travelMode, // Store the mode used
            };
          });
        } catch (error) {
          console.warn("[search-places] DistanceMatrix API failed, falling back to Haversine:", error);
          // Fallback to Haversine if DistanceMatrix fails
          // Simple Haversine calculation as fallback
          const R = 6371e3; // Earth radius in meters
          enriched = results.map((place) => {
            if (!searchLocation) {
              return { ...place, distanceMeters: undefined, walkingTimeMinutes: undefined, travelMode };
            }
            
            const φ1 = (searchLocation.lat * Math.PI) / 180;
            const φ2 = (place.location.lat * Math.PI) / 180;
            const Δφ = ((place.location.lat - searchLocation.lat) * Math.PI) / 180;
            const Δλ = ((place.location.lng - searchLocation.lng) * Math.PI) / 180;
            const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distanceMeters = R * c;
            const walkingTimeMinutes = Math.round(distanceMeters / 1.4 / 60); // 1.4 m/s walking speed

        return {
              ...place,
              distanceMeters,
              walkingTimeMinutes,
              travelTimeMinutes: walkingTimeMinutes,
              travelMode,
            };
          });
        }
      } else {
        // No location available, just copy results
        enriched = results.map((place) => ({
          ...place,
          distanceMeters: undefined,
          walkingTimeMinutes: undefined,
          travelMode,
        }));
      }

      // PHASE 2: Semantic Analysis (if semanticAttributes provided)
      if (context.semanticAttributes && context.semanticAttributes.length > 0) {
        console.log(`[search-places] Performing semantic analysis for attributes: ${context.semanticAttributes.join(', ')}`);

        const semanticAnalyzer = new SemanticReviewAnalyzer();
        const { getVibeCacheInstance } = await import('@/lib/services/vibe-cache-service');
        const vibeCache = getVibeCacheInstance();

        // Increase analysis limit for better vibe matching (was 12, now 20)
        const placesForAnalysis = enriched.slice(0, Math.min(20, enriched.length));
        console.log(`[search-places] Analyzing ${placesForAnalysis.length} places for vibe matching`);

        // Batch process for better performance
        const BATCH_SIZE = 5;
        const batches = [];
        for (let i = 0; i < placesForAnalysis.length; i += BATCH_SIZE) {
          batches.push(placesForAnalysis.slice(i, i + BATCH_SIZE));
        }

        // Process batches sequentially to avoid rate limiting
        const enrichedWithSemantics: any[] = [];

        for (const batch of batches) {
          const batchResults = await Promise.all(
            batch.map(async (place) => {
              try {
                // Check cache first
                const cachedAnalysis = vibeCache.get(
                  place.placeId,
                  context.semanticAttributes!
                );

                if (cachedAnalysis) {
                  console.log(`[search-places] Using cached vibe analysis for ${place.name}`);
                  return {
                    ...place,
                    semanticAttributes: cachedAnalysis,
                  };
                }

                // Fetch place details with reviews
                const details = await service.getPlaceDetails(place.placeId, [
                  'place_id',
                  'name',
                  'reviews',
                  'editorialSummary',
                ]);

                // Analyze reviews against semantic attributes
                const reviews = details.reviews || [];
                const reviewCount = reviews.length;
                const lastReviewTime = reviews[0]?.publishTime;

                const semanticAnalysis = await semanticAnalyzer.analyze(
                  reviews,
                  context.semanticAttributes!
                );

                // Cache the analysis result
                vibeCache.set(
                  place.placeId,
                  context.semanticAttributes!,
                  semanticAnalysis,
                  reviewCount,
                  lastReviewTime
                );

                return {
                  ...place,
                  semanticAttributes: semanticAnalysis,
                  reviewCount,
                };
              } catch (error) {
                console.warn(`[search-places] Failed to analyze semantics for ${place.name}:`, error);

                // Return empty scores on error
                return {
                  ...place,
                  semanticAttributes: context.semanticAttributes!.reduce((acc, attr) => {
                    acc[attr] = { score: 0, count: 0, evidence: [] };
                    return acc;
                  }, {} as Record<string, { score: number; count: number; evidence: string[] }>),
                };
              }
            })
          );

          enrichedWithSemantics.push(...batchResults);

          // Small delay between batches to avoid rate limiting
          if (batches.indexOf(batch) < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

        // Calculate semantic score for ranking
        const calculateSemanticScore = (place: any): number => {
          if (!place.semanticAttributes) return 0;
          
          const scores = context.semanticAttributes!.map(attr => {
            const result = place.semanticAttributes[attr];
            return result ? result.score : 0;
          });
          
          return scores.reduce((sum, score) => sum + score, 0) / scores.length;
        };

        // Rank by semantic score (weighted with distance/rating)
        enrichedWithSemantics.sort((a, b) => {
          const semanticScoreA = calculateSemanticScore(a);
          const semanticScoreB = calculateSemanticScore(b);
          
          // Primary sort: semantic score (descending)
          if (Math.abs(semanticScoreA - semanticScoreB) > 0.1) {
            return semanticScoreB - semanticScoreA;
          }
          
          // Secondary sort: distance (if available)
          if (searchLocation) {
            const distA = a.distanceMeters || Infinity;
            const distB = b.distanceMeters || Infinity;
            if (Math.abs(distA - distB) > 100) {
              return distA - distB;
            }
          }
          
          // Tertiary sort: rating
          const ratingA = a.rating || 0;
          const ratingB = b.rating || 0;
          return ratingB - ratingA;
        });

        // Merge with remaining places (that weren't analyzed)
        enriched = [
          ...enrichedWithSemantics,
          ...enriched.slice(12),
        ];
      } else {
        // No semantic analysis - sort by distance if we have location
      if (searchLocation) {
        enriched.sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
        }
      }

      // Generate insights
      // Determine search type based on what was provided
      const searchType: "text" | "nearby" = context.query ? "text" : "nearby";
      const insights = generatePlaceInsights(
        enriched,
        context.query || context.type || "places"
      );

      // Build map commands
      const mapCommands: Array<{ type: "CLEAR_MARKERS" | "SHOW_ON_MAP" | "PAN_TO"; payload: any }> = [];

      // Clear old place markers before showing new search results
      mapCommands.push({
        type: "CLEAR_MARKERS",
        payload: {},
      });

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

        // Stream mapCommands immediately via custom data streaming
        // This sends the map updates to the client before the full response
        // Note: Using data- prefix for custom types as required by AI SDK
        if (writer) {
          await writer.custom({
            type: "data-mapCommands",
            data: {
              mapCommands: mapCommands
            }
          });
        }
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
