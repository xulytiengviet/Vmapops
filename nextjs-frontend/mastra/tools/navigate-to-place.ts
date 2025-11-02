/**
 * Navigate To Place Tool
 * Combines geocoding with map commands (pan/fit/zoom)
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { GeocodingService } from "@/lib/services/geocoding-service";
import { generateGeocodeInsights } from "./utils/insight-generator";

const outputMapCommandEnum = z.enum([
  "PAN_TO",
  "SHOW_ON_MAP",
  "FIT_BOUNDS",
  "SET_ZOOM",
]);

export const navigateToPlace = createTool({
  id: "navigate-to-place",
  description:
    "Geocode a place name/address and issue map commands to pan/zoom the map there.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1, "Place query is required")
      .describe("Place name or address to navigate to"),
    zoom: z
      .number()
      .min(1)
      .max(21)
      .optional()
      .describe("Optional zoom level to set after panning"),
    dropMarker: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to drop a marker for the location"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z
      .object({
        place: z
          .object({
            name: z.string().optional(),
            formattedAddress: z.string(),
            location: z.object({ lat: z.number(), lng: z.number() }),
          })
          .optional(),
        mapCommands: z.array(
          z.object({
            type: outputMapCommandEnum,
            payload: z.any(),
          })
        ),
        insights: z.object({
          summary: z.string(),
          highlights: z.array(z.string()),
          suggestions: z.array(z.string()),
          warnings: z.array(z.string()).optional(),
        }),
      })
      .optional(),
    error: z.string().optional(),
  }),

  execute: async ({ context, writer }) => {
    const service = new GeocodingService();

    try {
      const results = await service.geocode(context.query);
      if (!results || results.length === 0) {
        return {
          success: false,
          error: `No results found for "${context.query}"`,
        };
      }

      const bestResult = results[0];
      const insights = generateGeocodeInsights(results, context.query);

      type MapCommandType = "PAN_TO" | "SET_ZOOM" | "FIT_BOUNDS" | "SHOW_ON_MAP";
      const mapCommands: Array<{ type: MapCommandType; payload: any }> = [];

      // Prefer FIT_BOUNDS when available (handles both center and zoom)
      if (bestResult.bounds?.northeast && bestResult.bounds?.southwest) {
        mapCommands.push({
          type: "FIT_BOUNDS",
          payload: {
            north: bestResult.bounds.northeast.lat,
            south: bestResult.bounds.southwest.lat,
            east: bestResult.bounds.northeast.lng,
            west: bestResult.bounds.southwest.lng,
          },
        });
      } else {
        // Fallback: PAN_TO and SET_ZOOM (use context zoom or default to 15)
        mapCommands.push({
          type: "PAN_TO",
          payload: bestResult.location,
        });
        const zoomLevel = typeof context.zoom === "number" ? context.zoom : 15;
        mapCommands.push({ type: "SET_ZOOM", payload: zoomLevel });
      }

      if (context.dropMarker) {
        mapCommands.push({
          type: "SHOW_ON_MAP",
          payload: {
            markers: [
              {
                id: `navigate-${bestResult.placeId}`,
                position: bestResult.location,
                title: bestResult.formattedAddress,
                type: "location",
                metadata: bestResult,
              },
            ],
          },
        });
      }

      console.log("[navigate-to-place] Generated mapCommands:", mapCommands);
      console.log("[navigate-to-place] Writer available:", !!writer);

      if (writer && mapCommands.length > 0) {
        console.log("[navigate-to-place] Attempting to stream mapCommands via writer.custom()");
        try {
          await writer.custom({
            type: "data-mapCommands",
            data: { mapCommands },
          });
          console.log("[navigate-to-place] Successfully streamed mapCommands");
        } catch (streamError) {
          console.error("[navigate-to-place] Error streaming mapCommands:", streamError);
        }
      } else {
        console.warn("[navigate-to-place] Writer not available or no mapCommands - mapCommands will be in tool result output");
      }

      return {
        success: true,
        data: {
          place: {
            name:
              bestResult.addressComponents?.find((component: any) =>
                component.types?.includes("point_of_interest")
              )?.longName || undefined,
            formattedAddress: bestResult.formattedAddress,
            location: bestResult.location,
          },
          mapCommands,
          insights,
        },
      };
    } catch (error) {
      console.error("navigate-to-place tool error:", error);
      return {
        success: false,
        error: `Navigation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});


