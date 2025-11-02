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
    - "quiet place to work" → query="quiet cafe workspace"
    
    NO HARDCODED RULES - Trust the LLM's semantic understanding to:
    1. Extract the user's intent from natural language
    2. Pass appropriate query terms to Google's intelligent search
    3. Let Google Places API interpret the query correctly
    
    The tool will automatically try multiple search strategies and merge results for best coverage.
    
    Returns: Places with name, location, rating, distance, and walking time
    Shows markers on map automatically when places are found.
  `,
  inputSchema: searchPlaceSchema,
  outputSchema: searchPlacesOutputSchema,

  execute: async ({ context, runtimeContext, writer }) => {
    try {
      const service = new PlacesService();

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

      // Enrich results with distance and walking time
      const enriched = results.map((place) => {
        const distance = searchLocation
          ? calculateDistance(searchLocation, place.location)
          : undefined;
        const walkingTime = distance ? estimateWalkingTime(distance) : undefined;

        return {
          ...place,
          distanceMeters: distance,
          walkingTimeMinutes: walkingTime,
        };
      });

      // Sort by distance if we have location
      if (searchLocation) {
        enriched.sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
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
