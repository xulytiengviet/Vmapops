/**
 * Get Popular Dishes Tool
 * Analyzes restaurant reviews to extract dish recommendations
 * Provides must-try items, popular dishes, and dining tips
 */

import { createTool } from "@mastra/core";
import { z } from "zod";
import { getReviewAnalysisService } from "@/lib/services/review-analysis-service";
import { PlacesService } from "@/lib/services/places-service";

export const getPopularDishes = createTool({
  id: "get-popular-dishes",
  name: "Get Popular Dishes",
  description: `Analyze restaurant reviews to find what's good, what to avoid, and insider tips.
    Extracts must-try dishes, popular items, dietary options, and practical advice from real customer reviews.
    Perfect for answering "What should I order?" or "What's good here?"`,

  inputSchema: z.object({
    placeId: z.string().describe("Google Place ID of the restaurant"),
    forceRefresh: z.boolean().optional().describe("Force refresh, bypassing cache"),
  }),

  execute: async ({ context }) => {
    console.log("[get-popular-dishes] Analyzing reviews for place:", context.placeId);

    try {
      const analysisService = getReviewAnalysisService();
      const placesService = new PlacesService();

      // Get restaurant name for context
      const details = await placesService.getPlaceDetails(context.placeId, [
        'name',
        'rating',
        'user_ratings_total',
      ]);

      const restaurantName = details?.name || 'Restaurant';
      const rating = details?.rating;
      const totalReviews = details?.user_ratings_total || 0;

      // Get dish recommendations from reviews
      const recommendations = await analysisService.getDishRecommendations(
        context.placeId,
        context.forceRefresh
      );

      // Check if we have meaningful recommendations
      const hasRecommendations =
        recommendations.mustTry.length > 0 ||
        recommendations.popular.length > 0 ||
        recommendations.tips.length > 0;

      if (!hasRecommendations) {
        return {
          success: true,
          data: {
            restaurantName,
            placeId: context.placeId,
            hasRecommendations: false,
            message: totalReviews === 0
              ? "This restaurant doesn't have any reviews yet. Be the first to try it!"
              : "Unable to extract specific dish recommendations from the available reviews.",
            rating,
            totalReviews,
            suggestion: "Check the menu or ask the staff for their recommendations.",
          },
        };
      }

      // Format recommendations for display
      const displayText = formatRecommendationsForDisplay(restaurantName, recommendations, rating);

      // Calculate insights
      const totalDishMentions =
        recommendations.mustTry.length +
        recommendations.popular.length +
        recommendations.avoid.length;

      const hasDietaryOptions =
        recommendations.dietaryOptions.vegetarian.length > 0 ||
        recommendations.dietaryOptions.vegan.length > 0 ||
        recommendations.dietaryOptions.glutenFree.length > 0 ||
        recommendations.dietaryOptions.halal.length > 0;

      return {
        success: true,
        data: {
          restaurantName,
          placeId: context.placeId,
          hasRecommendations: true,
          rating,
          totalReviews,
          recommendations: {
            mustTry: recommendations.mustTry,
            popular: recommendations.popular,
            avoid: recommendations.avoid,
            dietaryOptions: recommendations.dietaryOptions,
            tips: recommendations.tips,
            summary: recommendations.summary,
          },
          insights: {
            totalDishMentions,
            hasDietaryOptions,
            bestDish: recommendations.mustTry[0]?.name || recommendations.popular[0]?.name,
            topTip: recommendations.tips[0],
            sentiment: calculateOverallSentiment(recommendations),
          },
          displayText,
        },
      };
    } catch (error) {
      console.error("[get-popular-dishes] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to analyze restaurant reviews",
      };
    }
  },

  outputSchema: z.union([
    z.object({
      success: z.literal(true),
      data: z.object({
        restaurantName: z.string(),
        placeId: z.string(),
        hasRecommendations: z.boolean(),
        message: z.string().optional(),
        rating: z.number().optional(),
        totalReviews: z.number(),
        suggestion: z.string().optional(),
        recommendations: z
          .object({
            mustTry: z.array(
              z.object({
                name: z.string(),
                sentiment: z.enum(['positive', 'negative', 'neutral']),
                mentions: z.number(),
                excerpts: z.array(z.string()),
                rating: z.number(),
              })
            ),
            popular: z.array(
              z.object({
                name: z.string(),
                sentiment: z.enum(['positive', 'negative', 'neutral']),
                mentions: z.number(),
                excerpts: z.array(z.string()),
                rating: z.number(),
              })
            ),
            avoid: z.array(
              z.object({
                name: z.string(),
                sentiment: z.enum(['positive', 'negative', 'neutral']),
                mentions: z.number(),
                excerpts: z.array(z.string()),
                rating: z.number(),
              })
            ),
            dietaryOptions: z.object({
              vegetarian: z.array(z.string()),
              vegan: z.array(z.string()),
              glutenFree: z.array(z.string()),
              halal: z.array(z.string()),
            }),
            tips: z.array(z.string()),
            summary: z.string(),
          })
          .optional(),
        insights: z
          .object({
            totalDishMentions: z.number(),
            hasDietaryOptions: z.boolean(),
            bestDish: z.string().optional(),
            topTip: z.string().optional(),
            sentiment: z.enum(['very_positive', 'positive', 'mixed', 'negative']),
          })
          .optional(),
        displayText: z.string().optional(),
      }),
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
    }),
  ]),
});

/**
 * Format recommendations for display in chat
 */
function formatRecommendationsForDisplay(
  restaurantName: string,
  recommendations: any,
  rating?: number
): string {
  let display = `🍽️ **What's Good at ${restaurantName}**\n`;

  if (rating) {
    display += `⭐ ${rating}/5 stars\n`;
  }

  if (recommendations.summary) {
    display += `\n*${recommendations.summary}*\n`;
  }

  // Must-try dishes
  if (recommendations.mustTry.length > 0) {
    display += '\n**🔥 Must Try:**\n';
    recommendations.mustTry.forEach((dish: any) => {
      display += `• **${dish.name}**`;
      if (dish.mentions > 1) {
        display += ` (${dish.mentions} mentions)`;
      }
      display += '\n';
      if (dish.excerpts.length > 0) {
        display += `  _"${dish.excerpts[0]}"_\n`;
      }
    });
  }

  // Popular dishes
  if (recommendations.popular.length > 0) {
    display += '\n**📊 Popular Dishes:**\n';
    recommendations.popular.forEach((dish: any) => {
      display += `• ${dish.name}`;
      if (dish.rating > 0) {
        display += ` (${dish.rating}★)`;
      }
      display += '\n';
    });
  }

  // Dishes to avoid
  if (recommendations.avoid.length > 0) {
    display += '\n**⚠️ Consider Avoiding:**\n';
    recommendations.avoid.forEach((dish: any) => {
      display += `• ${dish.name}`;
      if (dish.excerpts.length > 0) {
        display += ` - "${dish.excerpts[0]}"\n`;
      } else {
        display += '\n';
      }
    });
  }

  // Dietary options
  const dietary = recommendations.dietaryOptions;
  const dietaryItems = [];

  if (dietary.vegetarian.length > 0) {
    dietaryItems.push(`🥗 Vegetarian: ${dietary.vegetarian.join(', ')}`);
  }
  if (dietary.vegan.length > 0) {
    dietaryItems.push(`🌱 Vegan: ${dietary.vegan.join(', ')}`);
  }
  if (dietary.glutenFree.length > 0) {
    dietaryItems.push(`🌾 Gluten-Free: ${dietary.glutenFree.join(', ')}`);
  }
  if (dietary.halal.length > 0) {
    dietaryItems.push(`🕌 Halal: ${dietary.halal.join(', ')}`);
  }

  if (dietaryItems.length > 0) {
    display += '\n**🍃 Dietary Options:**\n';
    dietaryItems.forEach(item => {
      display += `${item}\n`;
    });
  }

  // Insider tips
  if (recommendations.tips.length > 0) {
    display += '\n**💡 Insider Tips:**\n';
    recommendations.tips.forEach((tip: string) => {
      display += `• ${tip}\n`;
    });
  }

  return display;
}

/**
 * Calculate overall sentiment from recommendations
 */
function calculateOverallSentiment(recommendations: any): 'very_positive' | 'positive' | 'mixed' | 'negative' {
  const mustTryCount = recommendations.mustTry.length;
  const popularCount = recommendations.popular.length;
  const avoidCount = recommendations.avoid.length;

  const positiveCount = mustTryCount + popularCount;
  const negativeCount = avoidCount;

  if (positiveCount > 5 && negativeCount === 0) {
    return 'very_positive';
  } else if (positiveCount > negativeCount * 2) {
    return 'positive';
  } else if (negativeCount > positiveCount) {
    return 'negative';
  } else {
    return 'mixed';
  }
}