/**
 * Get Place Details Tool
 * Retrieves comprehensive information about a specific place
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { PlacesService } from "@/lib/services/places-service";

const getPlaceDetailsSchema = z.object({
  placeId: z.string().describe("Google Place ID"),
  fields: z
    .array(z.string())
    .optional()
    .describe("Specific fields to retrieve (optional)"),
});

const getPlaceDetailsOutputSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      name: z.string(),
      formattedAddress: z.string(),
      rating: z.number().optional(),
      userRatingsTotal: z.number().optional(),
      phoneNumber: z.string().optional(),
      website: z.string().optional(),
      openingHours: z.any().optional(),
      priceLevel: z.number().optional(),
      types: z.array(z.string()),
      reviews: z
        .array(
          z.object({
            author: z.string(),
            rating: z.number(),
            text: z.string(),
            time: z.string().optional(),
          })
        )
        .optional(),
      insights: z.object({
        summary: z.string(),
        highlights: z.array(z.string()),
        status: z.enum(["open", "closed", "unknown"]),
      }),
    })
    .optional(),
  error: z.string().optional(),
});

export const getPlaceDetails = createTool({
  id: "get-place-details",
  description: `
    Get comprehensive details about a specific place.

    Returns: Complete information including hours, contact, rating, reviews, photos

    Use when: User asks "tell me more about X", "what are the hours", "reviews for X"
  `,
  inputSchema: getPlaceDetailsSchema,
  outputSchema: getPlaceDetailsOutputSchema,

  execute: async ({ context, writer }) => {
    try {
      const service = new PlacesService();

      await writer?.write({
        type: "text",
        text: "Loading place details...",
      });

      const details = await service.getPlaceDetails(context.placeId, context.fields);

      if (!details) {
        return {
          success: false,
          error: "Could not retrieve place details",
        };
      }

      // Determine status
      let status: "open" | "closed" | "unknown" = "unknown";
      if (details.opening_hours?.open_now === true) {
        status = "open";
      } else if (details.opening_hours?.open_now === false) {
        status = "closed";
      }

      // Generate highlights
      const highlights: string[] = [];
      if (details.rating) {
        highlights.push(`Rating: ${details.rating}⭐ (${details.user_ratings_total} reviews)`);
      }
      if (details.price_level) {
        highlights.push(`Price: ${"$".repeat(details.price_level)}`);
      }
      if (status === "open") {
        highlights.push("Currently open");
      } else if (status === "closed") {
        highlights.push("Currently closed");
      }

      // Format reviews
      const reviews = (details.reviews || []).slice(0, 3).map((review: any) => ({
        author: review.author_name,
        rating: review.rating,
        text: review.text,
        time: new Date(review.time * 1000).toLocaleDateString(),
      }));

      const summary = `${details.name} - ${details.types?.[0] || "Place"}`;

      return {
        success: true,
        data: {
          name: details.name,
          formattedAddress: details.formatted_address,
          rating: details.rating,
          userRatingsTotal: details.user_ratings_total,
          phoneNumber: details.formatted_phone_number,
          website: details.website,
          openingHours: details.opening_hours?.weekday_text,
          priceLevel: details.price_level,
          types: details.types || [],
          reviews,
          insights: {
            summary,
            highlights,
            status,
          },
        },
      };
    } catch (error) {
      console.error("get-place-details tool error:", error);
      return {
        success: false,
        error: `Failed to get details: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});
