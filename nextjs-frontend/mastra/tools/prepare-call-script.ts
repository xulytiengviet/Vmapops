/**
 * Prepare Call Script Tool
 * Generates conversation scripts for making restaurant reservations by phone
 * Provides structured dialogue with fallback options
 */

import { createTool } from "@mastra/core";
import { z } from "zod";
import { PlacesService } from "@/lib/services/places-service";

export const prepareCallScript = createTool({
  id: "prepare-call-script",
  description: `Generate a phone conversation script for making restaurant reservations.
    Creates natural dialogue with multiple response options and fallback phrases.
    Includes handling for common scenarios like full bookings or special requests.`,

  inputSchema: z.object({
    placeId: z.string().describe("Google Place ID of the restaurant"),
    restaurantName: z.string().optional().describe("Name of the restaurant"),
    partySize: z.number().min(1).max(20).describe("Number of people"),
    date: z.string().describe("Reservation date (YYYY-MM-DD format)"),
    time: z.string().describe("Preferred time (HH:MM format)"),
    flexibleTime: z.boolean().optional().describe("Whether time is flexible"),
    alternativeTimes: z.array(z.string()).optional().describe("Alternative time slots"),
    specialRequests: z.string().optional().describe("Dietary restrictions or special occasions"),
    callerName: z.string().describe("Name for the reservation"),
    callerPhone: z.string().optional().describe("Contact number"),
    language: z.enum(['casual', 'formal']).optional().describe("Conversation tone"),
  }),

  execute: async ({ context }) => {
    console.log("[prepare-call-script] Generating script for:", context.restaurantName || context.placeId);

    try {
      const placesService = new PlacesService();

      // Get restaurant details if name not provided
      let restaurantName = context.restaurantName;
      let phoneNumber = '';

      if (!restaurantName || context.placeId) {
        const details = await placesService.getPlaceDetails(context.placeId, [
          'name',
          'internationalPhoneNumber',
        ]);
        restaurantName = restaurantName || details?.name || 'the restaurant';
        phoneNumber = details?.internationalPhoneNumber || '';
      }

      // Parse date and time
      const date = new Date(context.date);
      const dateStr = formatDateForSpeech(date);
      const timeStr = formatTimeForSpeech(context.time);
      const alternativeTimesStr = context.alternativeTimes?.map(t => formatTimeForSpeech(t)) || [];

      // Determine conversation style
      const tone = context.language || 'casual';

      // Generate the script
      const script = generateConversationScript({
        restaurantName,
        partySize: context.partySize,
        dateStr,
        timeStr,
        alternativeTimesStr,
        flexibleTime: context.flexibleTime || false,
        specialRequests: context.specialRequests,
        callerName: context.callerName,
        callerPhone: context.callerPhone,
        tone,
      });

      // Generate quick reference card
      const quickReference = generateQuickReference({
        restaurantName,
        phoneNumber,
        partySize: context.partySize,
        date: context.date,
        time: context.time,
        callerName: context.callerName,
      });

      // Generate troubleshooting responses
      const troubleshooting = generateTroubleshootingResponses(tone);

      return {
        success: true as const,
        data: {
          restaurantName: restaurantName || 'the restaurant',
          phoneNumber,
          script,
          quickReference,
          troubleshooting,
          tips: getCallTips(),
        },
      };
    } catch (error) {
      console.error("[prepare-call-script] Error:", error);
      return {
        success: false as const,
        error: error instanceof Error ? error.message : "Failed to prepare call script",
      };
    }
  },

  outputSchema: z.union([
    z.object({
      success: z.literal(true),
      data: z.object({
        restaurantName: z.string(),
        phoneNumber: z.string(),
        script: z.object({
          opening: z.string(),
          mainRequest: z.string(),
          alternatives: z.array(z.string()),
          specialRequests: z.string().optional(),
          confirmation: z.string(),
          closing: z.string(),
        }),
        quickReference: z.object({
          keyInfo: z.array(z.string()),
          mustMention: z.array(z.string()),
          dontForget: z.array(z.string()),
        }),
        troubleshooting: z.object({
          fullyBooked: z.string(),
          waitlist: z.string(),
          alternativeDate: z.string(),
          largeParty: z.string(),
          specialEvent: z.string(),
        }),
        tips: z.array(z.string()),
      }),
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
    }),
  ]),
});

/**
 * Generate the main conversation script
 */
function generateConversationScript(params: any): any {
  const {
    restaurantName,
    partySize,
    dateStr,
    timeStr,
    alternativeTimesStr,
    flexibleTime,
    specialRequests,
    callerName,
    callerPhone,
    tone,
  } = params;

  const script: any = {};

  // Opening
  if (tone === 'formal') {
    script.opening = `Good [morning/afternoon/evening], I'd like to make a reservation at ${restaurantName}, please.`;
  } else {
    script.opening = `Hi, I'd like to make a reservation for ${dateStr}.`;
  }

  // Main request
  const partyWord = partySize === 1 ? 'person' : 'people';
  script.mainRequest = `I need a table for ${partySize} ${partyWord} on ${dateStr} at ${timeStr}.`;

  // Alternative times
  script.alternatives = [];
  if (flexibleTime) {
    script.alternatives.push(`If ${timeStr} isn't available, I'm flexible with the time.`);
  }
  if (alternativeTimesStr.length > 0) {
    script.alternatives.push(
      `If that doesn't work, I could also do ${alternativeTimesStr.join(' or ')}.`
    );
  }
  script.alternatives.push(`What times do you have available that evening?`);

  // Special requests
  if (specialRequests) {
    script.specialRequests = formatSpecialRequests(specialRequests, tone);
  }

  // Confirmation
  script.confirmation = `Great! The reservation is under ${callerName}.`;
  if (callerPhone) {
    script.confirmation += ` My phone number is ${formatPhoneForSpeech(callerPhone)}.`;
  }

  // Closing
  if (tone === 'formal') {
    script.closing = `Thank you very much for your help. I look forward to dining with you.`;
  } else {
    script.closing = `Perfect, thank you so much! See you ${dateStr}.`;
  }

  return script;
}

/**
 * Generate quick reference card
 */
function generateQuickReference(params: any): any {
  const { restaurantName, phoneNumber, partySize, date, time, callerName } = params;

  return {
    keyInfo: [
      `Restaurant: ${restaurantName}`,
      phoneNumber ? `Phone: ${phoneNumber}` : '',
      `Party size: ${partySize}`,
      `Date: ${date}`,
      `Time: ${time}`,
      `Name: ${callerName}`,
    ].filter(Boolean),
    mustMention: [
      'Number of people',
      'Date and day of week',
      'Preferred time',
      'Name for reservation',
    ],
    dontForget: [
      'Ask about cancellation policy',
      'Confirm the address if unsure',
      'Ask if they need a credit card',
      'Get confirmation number if provided',
    ],
  };
}

/**
 * Generate troubleshooting responses
 */
function generateTroubleshootingResponses(tone: string): any {
  const formal = tone === 'formal';

  return {
    fullyBooked: formal
      ? "I understand you're fully booked. Would it be possible to be placed on a waiting list?"
      : "Oh, you're full? Can you put me on a waitlist in case something opens up?",

    waitlist: formal
      ? "Yes, I'd like to be added to the waiting list. What information do you need from me?"
      : "Yes please, add me to the waitlist. Here's my number...",

    alternativeDate: formal
      ? 'What about the following day? Or perhaps earlier in the week?'
      : 'How about tomorrow night instead? Or any other day this week?',

    largeParty: formal
      ? 'I understand large parties can be challenging. Would it be possible to book two adjacent tables?'
      : 'Could we maybe book two tables next to each other?',

    specialEvent: formal
      ? "It's actually for a special occasion - a birthday celebration. Does that change availability?"
      : "It's for a birthday dinner, if that helps at all?",
  };
}

/**
 * Format date for natural speech
 */
function formatDateForSpeech(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  };
  const dateStr = date.toLocaleDateString('en-US', options);

  // Add "this" or "next" for clarity
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'tonight';
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return 'tomorrow night';
  }

  return dateStr;
}

/**
 * Format time for natural speech
 */
function formatTimeForSpeech(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

  if (minute === 0) {
    return `${displayHour} ${period}`;
  } else if (minute === 30) {
    return `${displayHour}:30 ${period}`;
  } else if (minute === 15) {
    return `${displayHour}:15 ${period}`;
  } else if (minute === 45) {
    return `${displayHour}:45 ${period}`;
  }

  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format phone number for speech
 */
function formatPhoneForSpeech(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');

  // Format as groups for easy speech
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phone; // Return original if can't format
}

/**
 * Format special requests
 */
function formatSpecialRequests(requests: string, tone: string): string {
  const formal = tone === 'formal';

  // Common dietary restrictions
  if (requests.toLowerCase().includes('vegetarian')) {
    return formal
      ? 'We have vegetarians in our party. Could you confirm you have suitable options?'
      : 'We have some vegetarians - is that okay?';
  }

  if (requests.toLowerCase().includes('allerg')) {
    return formal
      ? `I should mention we have food allergies in our party: ${requests}. Can you accommodate that?`
      : `Just so you know, we have some allergies: ${requests}`;
  }

  if (requests.toLowerCase().includes('birthday') || requests.toLowerCase().includes('anniversary')) {
    return formal
      ? `This is for a special occasion - ${requests}. Is it possible to note that?`
      : `It's actually for a ${requests}, if you could make a note of that?`;
  }

  if (requests.toLowerCase().includes('wheelchair') || requests.toLowerCase().includes('accessible')) {
    return formal
      ? "We'll need wheelchair accessible seating. Is that available?"
      : 'We need wheelchair access - is that possible?';
  }

  // Generic request
  return formal
    ? `I have a special request: ${requests}`
    : `Also, ${requests}`;
}

/**
 * Get general tips for making reservation calls
 */
function getCallTips(): string[] {
  return [
    'Call during off-peak hours (2-4 PM) for better service',
    'Have a pen and paper ready to write down confirmation details',
    'Be flexible with times if possible',
    'Ask about parking if driving',
    "Mention if it's a special occasion",
    'Be polite and patient - restaurant staff are often busy',
    "If they're full, always ask about the waitlist",
    'Consider calling back if you get voicemail during busy hours',
  ];
}
