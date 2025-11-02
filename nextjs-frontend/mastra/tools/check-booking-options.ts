/**
 * Check Booking Options Tool
 * Finds available reservation platforms and booking methods for a restaurant
 * Provides links to OpenTable, Resy, and other booking services
 */

import { createTool } from "@mastra/core";
import { z } from "zod";
import { getBookingService } from "@/lib/services/booking-service";

export const checkBookingOptions = createTool({
  id: "check-booking-options",
  name: "Check Booking Options",
  description: `Find all available ways to book a table at a restaurant.
    Checks for OpenTable, Resy, Yelp, Google Reserve, and direct booking options.
    Provides booking links and phone numbers for reservations.`,

  inputSchema: z.object({
    placeId: z.string().describe("Google Place ID of the restaurant"),
  }),

  execute: async ({ context }) => {
    console.log("[check-booking-options] Getting booking options for:", context.placeId);

    try {
      const bookingService = getBookingService();

      // Get all booking options
      const bookingInfo = await bookingService.getBookingOptions(context.placeId);

      // Format options for display
      const displayText = formatBookingOptionsForDisplay(bookingInfo);

      // Determine booking status
      let bookingStatus: 'available' | 'walk_ins_only' | 'call_required' | 'unknown';

      if (bookingInfo.bookingOptions.length > 0) {
        if (bookingInfo.walkInsOnly) {
          bookingStatus = 'walk_ins_only';
        } else if (bookingInfo.acceptsReservations) {
          bookingStatus = 'available';
        } else if (bookingInfo.phoneNumber) {
          bookingStatus = 'call_required';
        } else {
          bookingStatus = 'unknown';
        }
      } else {
        bookingStatus = 'unknown';
      }

      return {
        success: true,
        data: {
          restaurantName: bookingInfo.restaurantName,
          placeId: bookingInfo.placeId,
          bookingStatus,
          acceptsReservations: bookingInfo.acceptsReservations,
          walkInsOnly: bookingInfo.walkInsOnly,
          phoneNumber: bookingInfo.phoneNumber,
          websiteUrl: bookingInfo.websiteUrl,
          bookingOptions: bookingInfo.bookingOptions,
          recommendedOption: bookingInfo.recommendedOption,
          bookingNotes: bookingInfo.bookingNotes,
          displayText,
          quickActions: generateQuickActions(bookingInfo),
        },
      };
    } catch (error) {
      console.error("[check-booking-options] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get booking options",
      };
    }
  },

  outputSchema: z.union([
    z.object({
      success: z.literal(true),
      data: z.object({
        restaurantName: z.string(),
        placeId: z.string(),
        bookingStatus: z.enum(['available', 'walk_ins_only', 'call_required', 'unknown']),
        acceptsReservations: z.boolean(),
        walkInsOnly: z.boolean(),
        phoneNumber: z.string().optional(),
        websiteUrl: z.string().optional(),
        bookingOptions: z.array(
          z.object({
            platform: z.enum(['opentable', 'resy', 'yelp', 'google', 'website', 'phone']),
            name: z.string(),
            url: z.string().optional(),
            phone: z.string().optional(),
            available: z.boolean(),
            directBooking: z.boolean(),
            notes: z.string().optional(),
          })
        ),
        recommendedOption: z
          .object({
            platform: z.enum(['opentable', 'resy', 'yelp', 'google', 'website', 'phone']),
            name: z.string(),
            url: z.string().optional(),
            phone: z.string().optional(),
            available: z.boolean(),
            directBooking: z.boolean(),
            notes: z.string().optional(),
          })
          .nullable(),
        bookingNotes: z.array(z.string()).optional(),
        displayText: z.string(),
        quickActions: z.array(
          z.object({
            label: z.string(),
            action: z.string(),
            value: z.string(),
          })
        ),
      }),
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
    }),
  ]),
});

/**
 * Format booking options for display
 */
function formatBookingOptionsForDisplay(bookingInfo: any): string {
  let display = `📅 **Booking Options for ${bookingInfo.restaurantName}**\n\n`;

  // Status summary
  if (bookingInfo.walkInsOnly) {
    display += '🚶 **Walk-ins Only** - No reservations accepted\n\n';
  } else if (bookingInfo.acceptsReservations) {
    display += '✅ **Reservations Available**\n\n';
  } else {
    display += '❓ **Reservation Policy Unclear** - Call to confirm\n\n';
  }

  // Recommended option
  if (bookingInfo.recommendedOption) {
    const rec = bookingInfo.recommendedOption;
    display += '**🌟 Recommended:**\n';

    if (rec.platform === 'phone') {
      display += `📱 Call directly: ${rec.phone}\n`;
      if (rec.notes) {
        display += `   _${rec.notes}_\n`;
      }
    } else {
      display += `🔗 ${rec.name}`;
      if (rec.url) {
        display += `: [Book Now](${rec.url})`;
      }
      display += '\n';
      if (rec.notes) {
        display += `   _${rec.notes}_\n`;
      }
    }
    display += '\n';
  }

  // All booking options
  if (bookingInfo.bookingOptions.length > 0) {
    display += '**All Options:**\n';

    // Group by type
    const phoneOptions = bookingInfo.bookingOptions.filter((o: any) => o.platform === 'phone');
    const onlineOptions = bookingInfo.bookingOptions.filter((o: any) => o.platform !== 'phone');

    // Online options
    if (onlineOptions.length > 0) {
      onlineOptions.forEach((option: any) => {
        const icon = getOptionIcon(option.platform);
        display += `${icon} **${option.name}**`;

        if (option.url) {
          display += `: [${option.directBooking ? 'Book' : 'Search'}](${option.url})`;
        }
        display += '\n';
      });
    }

    // Phone option
    if (phoneOptions.length > 0) {
      const phone = phoneOptions[0];
      display += `📱 **Call**: ${phone.phone}\n`;
    }
  } else {
    display += '_No booking options found_\n';
  }

  // Booking notes
  if (bookingInfo.bookingNotes && bookingInfo.bookingNotes.length > 0) {
    display += '\n**💡 Tips:**\n';
    bookingInfo.bookingNotes.forEach((note: string) => {
      display += `• ${note}\n`;
    });
  }

  return display;
}

/**
 * Get icon for platform
 */
function getOptionIcon(platform: string): string {
  const icons: { [key: string]: string } = {
    opentable: '🍽️',
    resy: '🎯',
    yelp: '⭐',
    google: '🔍',
    website: '🌐',
    phone: '📱',
  };
  return icons[platform] || '📍';
}

/**
 * Generate quick actions for UI
 */
function generateQuickActions(bookingInfo: any): Array<{ label: string; action: string; value: string }> {
  const actions = [];

  // Add call action if phone available
  if (bookingInfo.phoneNumber) {
    actions.push({
      label: 'Call Restaurant',
      action: 'call',
      value: bookingInfo.phoneNumber,
    });
  }

  // Add primary booking action
  if (bookingInfo.recommendedOption) {
    const rec = bookingInfo.recommendedOption;
    if (rec.platform !== 'phone' && rec.url) {
      actions.push({
        label: `Book on ${rec.name}`,
        action: 'open_url',
        value: rec.url,
      });
    }
  }

  // Add website action
  if (bookingInfo.websiteUrl) {
    actions.push({
      label: 'Visit Website',
      action: 'open_url',
      value: bookingInfo.websiteUrl,
    });
  }

  return actions;
}