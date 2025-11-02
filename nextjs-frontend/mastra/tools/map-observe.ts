/**
 * Map Observe Tool
 * Allows the agent to observe the current viewport and optionally sample places
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CityAnalystRuntimeContext } from "../agents/cityAnalystAgent";
import { PlacesService } from "@/lib/services/places-service";

const boundsSchema = z.object({
  north: z.number(),
  south: z.number(),
  east: z.number(),
  west: z.number(),
});

export const mapObserve = createTool({
  id: "map-observe",
  description:
    "Observe the current map viewport (bounds) and optionally sample places within it to summarize density and highlights.",
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe("Optional text query to sample visible places (e.g., 'coffee', 'restaurant')"),
    maxResults: z.number().optional().default(10),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z
      .object({
        bounds: boundsSchema,
        sampledCount: z.number(),
        insights: z.object({
          summary: z.string(),
          suggestions: z.array(z.string()),
        }),
        mapCommands: z
          .array(
            z.object({
              type: z.enum(["HIGHLIGHT_AREA", "FIT_BOUNDS", "SHOW_ON_MAP"] as any),
              payload: z.any(),
            })
          )
          .optional(),
      })
      .optional(),
    error: z.string().optional(),
  }),

  execute: async ({ context, runtimeContext, writer }) => {
    try {
      const mapBounds = runtimeContext?.get("mapBounds") as CityAnalystRuntimeContext["mapBounds"];
      const mapCenter = runtimeContext?.get("mapCenter") as CityAnalystRuntimeContext["mapCenter"];
      if (!mapBounds) {
        return { success: false, error: "mapBounds not available in runtime context" };
      }

      const mapCommands: Array<{ type: string; payload: any }> = [];
      // Always highlight the currently visible area
      mapCommands.push({ type: "HIGHLIGHT_AREA", payload: { bounds: mapBounds, color: "#22c55e" } });

      if (writer) {
        await writer.custom({ type: "data-mapCommands", data: { mapCommands } });
      }

      let sampledCount = 0;
      const places: any[] = [];

      if (context.query) {
        // Approximate a radius from bounds diagonal
        const latSpan = Math.abs(mapBounds.north - mapBounds.south);
        const lngSpan = Math.abs(mapBounds.east - mapBounds.west);
        const approxKmPerLatDeg = 111; // rough
        const approxKmPerLngDeg = 111 * Math.cos(((mapCenter?.lat || 0) * Math.PI) / 180);
        const diagKm = Math.sqrt(
          Math.pow(latSpan * approxKmPerLatDeg, 2) + Math.pow(lngSpan * approxKmPerLngDeg, 2)
        );
        const radiusMeters = Math.max(200, Math.min(5000, (diagKm * 1000) / 2));

        const service = new PlacesService();
        const results = await service.textSearch(context.query, {
          location: mapCenter,
          radius: radiusMeters,
          maxResults: Math.min(context.maxResults || 10, 20),
        });
        places.push(...results);
        sampledCount = places.length;

        if (places.length > 0) {
          mapCommands.push({
            type: "SHOW_ON_MAP",
            payload: {
              markers: places.slice(0, 10).map((p) => ({
                id: p.placeId,
                position: p.location,
                title: p.name,
                type: "place",
                metadata: p,
              })),
            },
          });
          if (writer) {
            await writer.custom({ type: "data-mapCommands", data: { mapCommands } });
          }
        }
      }

      const suggestions: string[] = [];
      if (context.query) {
        suggestions.push(
          `Zoom in to refine visible results for "${context.query}" or try a nearby neighborhood.`
        );
      } else {
        suggestions.push("Ask me to scan the area for coffee, restaurants, parks, or shops.");
      }

      return {
        success: true,
        data: {
          bounds: mapBounds,
          sampledCount,
          insights: {
            summary: context.query
              ? `Observed ${sampledCount} visible results for "${context.query}" in the current viewport.`
              : "Observed current viewport bounds. No sampling query provided.",
            suggestions,
          },
          mapCommands,
        },
      };
    } catch (error) {
      console.error("map-observe tool error:", error);
      return {
        success: false,
        error: `Observation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});


