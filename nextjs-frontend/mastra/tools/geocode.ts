/**
 * Geocode Tool
 * Convert between addresses and coordinates (bidirectional)
 * Supports both forward and reverse geocoding
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { GeocodingService } from "@/lib/services/geocoding-service";
import type { CityAnalystRuntimeContext } from "../agents/cityAnalystAgent";
import { generateGeocodeInsights } from "./utils/insight-generator";

const geocodeSchema = z.object({
  // Either address (forward) or coordinates (reverse)
  address: z.string().optional().describe("Street address to geocode"),

  coordinates: z
    .object({
      lat: z.number().describe("Latitude"),
      lng: z.number().describe("Longitude"),
    })
    .optional()
    .describe("Coordinates to reverse geocode"),
});

const locationSchema = z.object({
  formattedAddress: z.string(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  locationType: z.string(),
  placeId: z.string(),
  addressComponents: z.array(
    z.object({
      longName: z.string(),
      shortName: z.string(),
      types: z.array(z.string()),
    })
  ),
  bounds: z
    .object({
      northeast: z.object({
        lat: z.number(),
        lng: z.number(),
      }),
      southwest: z.object({
        lat: z.number(),
        lng: z.number(),
      }),
    })
    .optional(),
});

const geocodeOutputSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      results: z.array(locationSchema),
      insights: z.object({
        summary: z.string(),
        highlights: z.array(z.string()),
        suggestions: z.array(z.string()),
        warnings: z.array(z.string()).optional(),
      }),
      mapCommands: z.array(
        z.object({
          type: z.enum(["PAN_TO", "SHOW_ON_MAP", "FIT_BOUNDS", "SET_ZOOM"] as any),
          payload: z.any(),
        })
      ),
    })
    .optional(),
  error: z.string().optional(),
});

export const geocode = createTool({
  id: "geocode",
  description: `
    Convert between addresses and coordinates.

    Forward geocoding: Convert address → coordinates
    - Input: 'address' (e.g., "1600 Pennsylvania Avenue, Washington DC")
    - Output: {lat, lng, place info}

    Reverse geocoding: Convert coordinates → address
    - Input: 'coordinates' (e.g., {lat: 40.7128, lng: -74.0060})
    - Output: Nearest address(es)

    Use when: User provides an address that needs coordinates, or you need to find what's at specific coordinates
  `,
  inputSchema: geocodeSchema,
  outputSchema: geocodeOutputSchema,

  execute: async ({ context, runtimeContext, writer }) => {
    try {
      const service = new GeocodingService();
      
      // Log RuntimeContext for debugging (useful for future enhancements)
      const userLocation = runtimeContext?.get("userLocation") as CityAnalystRuntimeContext["userLocation"];
      if (userLocation) {
        console.log("[geocode] User location available in RuntimeContext:", userLocation);
      }

      // Determine mode
      const isForwardGeocode = !!context.address && !context.coordinates;
      const isReverseGeocode = !!context.coordinates && !context.address;

      if (!isForwardGeocode && !isReverseGeocode) {
        return {
          success: false,
          error:
            "Provide either 'address' (forward geocoding) or 'coordinates' (reverse geocoding)",
        };
      }

      // Note: Removed incorrect writer.write() call that was causing AI SDK validation error
      // The writer should use text-start/text-delta/text-end or custom data parts
      
      let results: any[] = [];

      if (isForwardGeocode) {
        // Forward geocoding
        results = await service.geocode(context.address!);
      } else {
        // Reverse geocoding
        results = await service.reverseGeocode(context.coordinates!);
      }

      // Generate insights
      const query = context.address || `${context.coordinates?.lat}, ${context.coordinates?.lng}`;
      const insights = generateGeocodeInsights(results, query);

      // Build map commands
      const mapCommands: Array<{ type: "PAN_TO" | "SHOW_ON_MAP" | "FIT_BOUNDS" | "SET_ZOOM"; payload: any }> = [];

      if (results.length > 0) {
        const firstResult = results[0];

        // Pan to location
        mapCommands.push({
          type: "PAN_TO",
          payload: firstResult.location,
        });

        // If bounds are available from geocoder, fit to them
        if (firstResult.bounds?.northeast && firstResult.bounds?.southwest) {
          mapCommands.push({
            type: "FIT_BOUNDS",
            payload: {
              north: firstResult.bounds.northeast.lat,
              south: firstResult.bounds.southwest.lat,
              east: firstResult.bounds.northeast.lng,
              west: firstResult.bounds.southwest.lng,
            },
          });
        } else {
          // Otherwise, set a reasonable zoom
          mapCommands.push({ type: "SET_ZOOM", payload: 15 });
        }

        // Show marker for all results
        if (results.length > 0) {
          mapCommands.push({
            type: "SHOW_ON_MAP",
            payload: {
              markers: results.map((result, idx) => ({
                id: `geocode-${idx}`,
                position: result.location,
                title: result.formattedAddress,
                type: "location",
                metadata: result,
              })),
            },
          });
        }
      }

      // Stream map commands immediately so the UI moves even if later tools fail
      if (writer && mapCommands.length > 0) {
        await writer.custom({ type: "data-mapCommands", data: { mapCommands } });
      }

      return {
        success: true,
        data: {
          results,
          insights,
          mapCommands,
        },
      };
    } catch (error) {
      console.error("geocode tool error:", error);
      return {
        success: false,
        error: `Geocoding failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});
