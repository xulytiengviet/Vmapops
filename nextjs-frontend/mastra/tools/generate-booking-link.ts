/**
 * Generate Booking Link Tool
 * Creates pre-filled booking links for restaurant reservations
 * Supports OpenTable, Resy, and other platforms with party size and date/time
 */

import { createTool } from "@mastra/core";
import { z } from "zod";
import { getBookingService } from "@/lib/services/booking-service";

export const generateBookingLink = createTool({
  id: "generate-booking-link",
  name: "Generate Booking Link",
  description: `Generate a pre-filled booking link for restaurant reservations.
    Creates links with party size, date, and time already filled in.
    Supports OpenTable, Resy, Yelp, and other major booking platforms.`,

  inputSchema: z.object({
    placeId: z.string().describe("Google Place ID of the restaurant"),
    partySize: z.number().min(1).max(20).describe("Number of people (default: 2)").optional(),
    date: z.string().describe("Reservation date (YYYY-MM-DD format)").optional(),
    time: z.string().describe("Reservation time (HH:MM format, 24-hour)").optional(),
    platform: z
      .enum(['opentable', 'resy', 'yelp', 'google', 'auto'])
      .describe("Booking platform to use (default: auto-select best)")
      .optional(),
    specialRequests: z.string().describe("Special requests or notes").optional(),
  }),

  execute: async ({ context }) => {
    console.log("[generate-booking-link] Creating booking link for:", context.placeId);

    try {
      const bookingService = getBookingService();

      // Get booking options first
      const bookingInfo = await bookingService.getBookingOptions(context.placeId);

      if (bookingInfo.bookingOptions.length === 0) {
        return {
          success: false,
          error: "No booking options available for this restaurant",
          suggestion: bookingInfo.walkInsOnly
            ? "This restaurant is walk-ins only"
            : "Try calling the restaurant directly",
          phoneNumber: bookingInfo.phoneNumber,
        };
      }

      // Parse and validate date/time
      const partySize = context.partySize || 2;
      const date = context.date ? new Date(context.date) : getDefaultDate();
      const time = context.time || '19:00';

      // Validate date is in the future
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today) {
        return {
          success: false,
          error: "Reservation date must be in the future",
        };
      }

      // Select platform
      let selectedOption;
      if (context.platform && context.platform !== 'auto') {
        selectedOption = bookingInfo.bookingOptions.find(
          (o: any) => o.platform === context.platform
        );
        if (!selectedOption) {
          return {
            success: false,
            error: `${context.platform} is not available for this restaurant`,
            availablePlatforms: bookingInfo.bookingOptions.map((o: any) => o.platform),
          };
        }
      } else {
        // Auto-select best option
        selectedOption = bookingInfo.recommendedOption || bookingInfo.bookingOptions[0];
      }

      // Generate the booking link
      const bookingLink = bookingService.generateBookingLink(selectedOption, {
        placeId: context.placeId,
        partySize,
        date,
        time,
        specialRequests: context.specialRequests,
      });

      // Format display text
      const displayText = formatBookingLinkDisplay(
        bookingInfo.restaurantName,
        selectedOption,
        partySize,
        date,
        time,
        bookingLink,
        context.specialRequests
      );

      // Generate alternative options
      const alternatives = bookingInfo.bookingOptions
        .filter((o: any) => o.platform !== selectedOption.platform)
        .map((option: any) => ({
          platform: option.platform,
          name: option.name,
          link: bookingService.generateBookingLink(option, {
            placeId: context.placeId,
            partySize,
            date,
            time,
          }),
        }));

      return {
        success: true,
        data: {
          restaurantName: bookingInfo.restaurantName,
          placeId: bookingInfo.placeId,
          bookingLink,
          platform: selectedOption.platform,
          platformName: selectedOption.name,
          reservation: {
            partySize,
            date: date.toISOString().split('T')[0],
            time,
            specialRequests: context.specialRequests,
          },
          displayText,
          alternativeOptions: alternatives,
          phoneNumber: bookingInfo.phoneNumber,
          bookingNotes: generateBookingInstructions(selectedOption, bookingInfo),
        },
      };
    } catch (error) {
      console.error("[generate-booking-link] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate booking link",
      };
    }
  },

  outputSchema: z.union([
    z.object({
      success: z.literal(true),
      data: z.object({
        restaurantName: z.string(),
        placeId: z.string(),
        bookingLink: z.string(),
        platform: z.string(),
        platformName: z.string(),
        reservation: z.object({
          partySize: z.number(),
          date: z.string(),
          time: z.string(),
          specialRequests: z.string().optional(),
        }),
        displayText: z.string(),
        alternativeOptions: z.array(
          z.object({
            platform: z.string(),
            name: z.string(),
            link: z.string(),
          })
        ),
        phoneNumber: z.string().optional(),
        bookingNotes: z.array(z.string()),
      }),
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
      suggestion: z.string().optional(),
      phoneNumber: z.string().optional(),
      availablePlatforms: z.array(z.string()).optional(),
    }),
  ]),
});

/**
 * Get default reservation date (tomorrow at 7pm)
 */
function getDefaultDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1); // Tomorrow
  return date;
}

/**
 * Format booking link for display
 */
function formatBookingLinkDisplay(
  restaurantName: string,
  option: any,
  partySize: number,
  date: Date,
  time: string,
  bookingLink: string,
  specialRequests?: string
): string {
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Convert 24-hour time to 12-hour with AM/PM
  const hour = parseInt(time.split(':')[0]);
  const minute = time.split(':')[1];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const timeStr = `${displayHour}:${minute} ${ampm}`;

  let display = `🎉 **Reservation Link Ready!**\n\n`;
  display += `**Restaurant:** ${restaurantName}\n`;
  display += `**Date:** ${dateStr}\n`;
  display += `**Time:** ${timeStr}\n`;
  display += `**Party Size:** ${partySize} ${partySize === 1 ? 'person' : 'people'}\n`;

  if (specialRequests) {
    display += `**Special Requests:** ${specialRequests}\n`;
  }

  display += `\n**📲 ${option.name} Booking Link:**\n`;
  display += `[Click here to book](${bookingLink})\n`;

  if (option.platform === 'phone') {
    display += `\n_Or copy this number: ${option.phone}_\n`;
  } else {
    display += `\n_This link will open ${option.name} with your reservation details pre-filled._\n`;
    display += `_You may need to create an account or sign in to complete the booking._\n`;
  }

  return display;
}

/**
 * Generate booking instructions based on platform
 */
function generateBookingInstructions(option: any, bookingInfo: any): string[] {
  const notes: string[] = [];

  switch (option.platform) {
    case 'opentable':
      notes.push('You may need an OpenTable account to complete the booking');
      notes.push('Check for any deposit or cancellation policy');
      break;

    case 'resy':
      notes.push('Resy account required to book');
      notes.push('Some restaurants require credit card to hold reservation');
      break;

    case 'yelp':
      notes.push('This will search for the restaurant on Yelp');
      notes.push('Look for the "Make a Reservation" button on the restaurant page');
      break;

    case 'google':
      notes.push('Book directly through Google Maps');
      notes.push('Google account required');
      break;

    case 'website':
      notes.push('Check the website for reservation system or contact info');
      notes.push('Look for "Reservations" or "Book a Table" links');
      break;

    case 'phone':
      notes.push('Call during business hours for best results');
      notes.push('Have your date, time, and party size ready');
      if (bookingInfo.bookingNotes && bookingInfo.bookingNotes.length > 0) {
        notes.push(...bookingInfo.bookingNotes);
      }
      break;
  }

  // Add general tips
  if (option.platform !== 'phone') {
    notes.push('If online booking is full, try calling directly');
  }

  return notes;
}