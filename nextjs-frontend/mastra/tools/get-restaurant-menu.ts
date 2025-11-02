/**
 * Get Restaurant Menu Tool
 * Fetches restaurant menu using OCR on Google Places photos
 * Falls back to structured data when available
 */

import { createTool } from "@mastra/core";
import { z } from "zod";
import { getMenuService } from "@/lib/services/menu-service";
import { PlacesService } from "@/lib/services/places-service";

export const getRestaurantMenu = createTool({
  id: "get-restaurant-menu",
  name: "Get Restaurant Menu",
  description: `Fetch menu items and prices for a restaurant.
    Uses OCR to extract menu data from photos when available.
    Returns structured menu with sections, items, prices, and dietary info.`,

  inputSchema: z.object({
    placeId: z.string().describe("Google Place ID of the restaurant"),
    restaurantName: z.string().optional().describe("Name of the restaurant"),
    forceRefresh: z.boolean().optional().describe("Force refresh, bypassing cache"),
  }),

  execute: async ({ context }) => {
    console.log("[get-restaurant-menu] Fetching menu for place:", context.placeId);

    try {
      const menuService = getMenuService();

      // Get menu data
      const menu = await menuService.getRestaurantMenu(
        context.placeId,
        context.restaurantName,
        context.forceRefresh
      );

      if (!menu) {
        // If no menu found, try to get basic info from place details
        const placesService = new PlacesService();
        const details = await placesService.getPlaceDetails(context.placeId, [
          'name',
          'types',
          'priceLevel',
        ]);

        const restaurantName = context.restaurantName || details?.name || 'Restaurant';

        return {
          success: true,
          data: {
            restaurantName,
            placeId: context.placeId,
            menuAvailable: false,
            message: "No menu photos found for this restaurant. The restaurant may not have uploaded menu photos to Google.",
            priceLevel: details?.priceLevel,
            cuisineType: details?.types?.[0],
            suggestion: "You can check the restaurant's website or call them directly for menu information.",
          },
        };
      }

      // Format menu for response
      const totalItems = menu.sections.reduce((sum, section) => sum + section.items.length, 0);

      // Extract price range
      const prices = menu.sections
        .flatMap(s => s.items)
        .map(item => {
          const priceMatch = item.price?.match(/\d+\.?\d*/);
          return priceMatch ? parseFloat(priceMatch[0]) : null;
        })
        .filter(p => p !== null) as number[];

      const priceRange = prices.length > 0
        ? {
            min: Math.min(...prices),
            max: Math.max(...prices),
            average: prices.reduce((sum, p) => sum + p, 0) / prices.length,
          }
        : null;

      // Find popular items (for now, just highlight items with certain keywords)
      const popularItems = menu.sections
        .flatMap(s => s.items)
        .filter(item =>
          item.name.toLowerCase().includes('special') ||
          item.name.toLowerCase().includes('signature') ||
          item.name.toLowerCase().includes('famous')
        )
        .slice(0, 5);

      // Find dietary options
      const dietaryOptions = new Set<string>();
      menu.sections.forEach(section => {
        section.items.forEach(item => {
          item.dietary?.forEach(d => dietaryOptions.add(d));
        });
      });

      return {
        success: true,
        data: {
          restaurantName: menu.restaurantName,
          placeId: menu.placeId,
          menuAvailable: true,
          lastUpdated: menu.lastUpdated,
          source: menu.source,
          confidence: menu.confidence,
          sections: menu.sections,
          summary: {
            totalItems,
            totalSections: menu.sections.length,
            priceRange,
            popularItems: popularItems.map(item => ({
              name: item.name,
              price: item.price,
              section: menu.sections.find(s => s.items.includes(item))?.name,
            })),
            dietaryOptions: Array.from(dietaryOptions),
          },
          displayText: formatMenuForDisplay(menu),
        },
      };
    } catch (error) {
      console.error("[get-restaurant-menu] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch restaurant menu",
      };
    }
  },

  outputSchema: z.union([
    z.object({
      success: z.literal(true),
      data: z.object({
        restaurantName: z.string(),
        placeId: z.string(),
        menuAvailable: z.boolean(),
        lastUpdated: z.date().optional(),
        source: z.enum(['photos', 'website', 'api', 'manual']).optional(),
        confidence: z.number().optional(),
        message: z.string().optional(),
        priceLevel: z.number().optional(),
        cuisineType: z.string().optional(),
        suggestion: z.string().optional(),
        sections: z.array(
          z.object({
            name: z.string(),
            items: z.array(
              z.object({
                name: z.string(),
                price: z.string().optional(),
                description: z.string().optional(),
                category: z.string().optional(),
                dietary: z.array(z.string()).optional(),
                popular: z.boolean().optional(),
              })
            ),
          })
        ).optional(),
        summary: z.object({
          totalItems: z.number(),
          totalSections: z.number(),
          priceRange: z.object({
            min: z.number(),
            max: z.number(),
            average: z.number(),
          }).nullable(),
          popularItems: z.array(
            z.object({
              name: z.string(),
              price: z.string().optional(),
              section: z.string().optional(),
            })
          ),
          dietaryOptions: z.array(z.string()),
        }).optional(),
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
 * Format menu for display in chat
 */
function formatMenuForDisplay(menu: any): string {
  let display = `📋 **${menu.restaurantName} Menu**\n\n`;

  if (menu.confidence) {
    display += `*Extracted from photos (${Math.round(menu.confidence * 100)}% confidence)*\n\n`;
  }

  menu.sections.forEach((section: any) => {
    display += `**${section.name}**\n`;

    section.items.forEach((item: any) => {
      display += `• ${item.name}`;
      if (item.price) {
        display += ` - ${item.price}`;
      }
      if (item.dietary && item.dietary.length > 0) {
        display += ` (${item.dietary.join(', ')})`;
      }
      display += '\n';
      if (item.description) {
        display += `  _${item.description}_\n`;
      }
    });

    display += '\n';
  });

  return display;
}