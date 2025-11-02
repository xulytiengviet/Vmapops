/**
 * Map Control Tool
 * Allows the agent to explicitly control the map viewport and layers
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const latLngSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

const boundsSchema = z.object({
  north: z.number(),
  south: z.number(),
  east: z.number(),
  west: z.number(),
});

export const mapControl = createTool({
  id: "map-control",
  description:
    "Control the map viewport and layers: pan, zoom, fit bounds, and clear markers/routes/highlights.",
  inputSchema: z.object({
    panTo: latLngSchema.optional(),
    setZoom: z.number().min(1).max(21).optional(),
    fitBounds: boundsSchema.optional(),
    clearMarkers: z.boolean().optional(),
    clearRoutes: z.boolean().optional(),
    clearHighlights: z.boolean().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    mapCommands: z
      .array(
        z.object({
          type: z.string(),
          payload: z.any(),
        })
      )
      .optional(),
  }),

  execute: async ({ context, writer }) => {
    const mapCommands: Array<{ type: string; payload: any }> = [];

    if (context.panTo) {
      mapCommands.push({ type: "PAN_TO", payload: context.panTo });
    }
    if (typeof context.setZoom === "number") {
      mapCommands.push({ type: "SET_ZOOM", payload: context.setZoom });
    }
    if (context.fitBounds) {
      mapCommands.push({ type: "FIT_BOUNDS", payload: context.fitBounds });
    }
    if (context.clearMarkers) {
      mapCommands.push({ type: "CLEAR_MARKERS", payload: null });
    }
    if (context.clearRoutes) {
      mapCommands.push({ type: "CLEAR_ROUTES", payload: null });
    }
    if (context.clearHighlights) {
      mapCommands.push({ type: "CLEAR_HIGHLIGHTS", payload: null });
    }

    if (writer && mapCommands.length > 0) {
      await writer.custom({ type: "data-mapCommands", data: { mapCommands } });
    }

    return { success: true, mapCommands };
  },
});


