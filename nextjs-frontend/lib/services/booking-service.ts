/**
 * Booking Service
 * Handles restaurant reservation options and booking links
 * Detects booking platforms and generates appropriate links
 */

import { PlacesService } from './places-service';

export interface BookingOption {
  platform: 'opentable' | 'resy' | 'yelp' | 'google' | 'website' | 'phone';
  name: string;
  url?: string;
  phone?: string;
  available: boolean;
  directBooking: boolean;
  notes?: string;
}

export interface BookingRequest {
  placeId: string;
  partySize?: number;
  date?: Date;
  time?: string;
  specialRequests?: string;
}

export interface BookingInfo {
  restaurantName: string;
  placeId: string;
  bookingOptions: BookingOption[];
  recommendedOption: BookingOption | null;
  phoneNumber?: string;
  websiteUrl?: string;
  acceptsReservations: boolean;
  walkInsOnly: boolean;
  bookingNotes?: string[];
}

export class BookingService {
  private placesService: PlacesService;

  constructor() {
    this.placesService = new PlacesService();
  }

  /**
   * Get all available booking options for a restaurant
   */
  async getBookingOptions(placeId: string): Promise<BookingInfo> {
    try {
      console.log(`[BookingService] Getting booking options for ${placeId}`);

      // Get restaurant details
      const details = await this.placesService.getPlaceDetails(placeId, [
        'name',
        'website',
        'internationalPhoneNumber',
        'types',
        'businessStatus',
        'reservable',
        'servesBrunch',
        'servesDinner',
        'servesLunch',
      ]);

      if (!details) {
        throw new Error('Restaurant not found');
      }

      const restaurantName = details.name || 'Restaurant';
      const phoneNumber = details.internationalPhoneNumber;
      const websiteUrl = details.website;
      const types = details.types || [];

      // Check if it's a restaurant/cafe that typically accepts reservations
      const acceptsReservations = this.checkIfAcceptsReservations(types, details);

      // Detect booking platforms
      const bookingOptions: BookingOption[] = [];

      // 1. Check for phone booking
      if (phoneNumber) {
        bookingOptions.push({
          platform: 'phone',
          name: 'Call Restaurant',
          phone: phoneNumber,
          available: true,
          directBooking: true,
          notes: 'Direct booking with the restaurant',
        });
      }

      // 2. Check for OpenTable
      const openTableOption = this.generateOpenTableLink(restaurantName, details);
      if (openTableOption) {
        bookingOptions.push(openTableOption);
      }

      // 3. Check for Resy
      const resyOption = this.generateResyLink(restaurantName, details);
      if (resyOption) {
        bookingOptions.push(resyOption);
      }

      // 4. Check for Yelp Reservations
      const yelpOption = this.generateYelpLink(restaurantName, details);
      if (yelpOption) {
        bookingOptions.push(yelpOption);
      }

      // 5. Check for website booking
      if (websiteUrl) {
        bookingOptions.push({
          platform: 'website',
          name: 'Restaurant Website',
          url: websiteUrl,
          available: true,
          directBooking: true,
          notes: 'Check website for reservation system',
        });
      }

      // 6. Google Reserve (if available)
      if (details.reservable) {
        bookingOptions.push({
          platform: 'google',
          name: 'Google Reserve',
          url: `https://www.google.com/maps/reserve/v/dine/${placeId}`,
          available: true,
          directBooking: false,
          notes: 'Book through Google Maps',
        });
      }

      // Determine recommended option
      const recommendedOption = this.selectRecommendedOption(bookingOptions);

      // Check if walk-ins only
      const walkInsOnly = this.checkIfWalkInsOnly(types, acceptsReservations, bookingOptions);

      // Generate booking notes
      const bookingNotes = this.generateBookingNotes(details, types);

      return {
        restaurantName,
        placeId,
        bookingOptions,
        recommendedOption,
        phoneNumber,
        websiteUrl,
        acceptsReservations,
        walkInsOnly,
        bookingNotes,
      };
    } catch (error) {
      console.error('[BookingService] Error getting booking options:', error);
      throw error;
    }
  }

  /**
   * Generate a booking link with pre-filled information
   */
  generateBookingLink(
    option: BookingOption,
    request: BookingRequest
  ): string {
    const { partySize = 2, date = new Date(), time = '19:00' } = request;

    // Format date for URLs
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = time.replace(':', '');

    switch (option.platform) {
      case 'opentable':
        // OpenTable deep link format
        return `${option.url}?covers=${partySize}&dateTime=${dateStr}T${time}`;

      case 'resy':
        // Resy deep link format
        return `${option.url}?date=${dateStr}&seats=${partySize}`;

      case 'yelp':
        // Yelp reservation link
        return `${option.url}?reservation_date=${dateStr}&reservation_time=${timeStr}&reservation_covers=${partySize}`;

      case 'google':
        // Google Reserve link
        return `${option.url}?party_size=${partySize}`;

      case 'website':
        // Just return the website URL
        return option.url || '';

      default:
        return option.url || '';
    }
  }

  /**
   * Generate OpenTable link
   */
  private generateOpenTableLink(restaurantName: string, details: any): BookingOption | null {
    // Clean restaurant name for URL
    const cleanName = encodeURIComponent(restaurantName.replace(/[^\w\s]/gi, ''));
    const city = this.extractCity(details);

    return {
      platform: 'opentable',
      name: 'OpenTable',
      url: `https://www.opentable.com/s?term=${cleanName}&location=${city}`,
      available: true,
      directBooking: false,
      notes: 'Search on OpenTable',
    };
  }

  /**
   * Generate Resy link
   */
  private generateResyLink(restaurantName: string, details: any): BookingOption | null {
    const cleanName = encodeURIComponent(restaurantName);
    const city = this.extractCity(details);

    // Resy uses city slugs (e.g., 'sf' for San Francisco)
    const citySlug = this.getCitySlug(city);

    return {
      platform: 'resy',
      name: 'Resy',
      url: `https://resy.com/cities/${citySlug}?query=${cleanName}`,
      available: true,
      directBooking: false,
      notes: 'Search on Resy',
    };
  }

  /**
   * Generate Yelp link
   */
  private generateYelpLink(restaurantName: string, details: any): BookingOption | null {
    const cleanName = encodeURIComponent(restaurantName);
    const city = this.extractCity(details);

    return {
      platform: 'yelp',
      name: 'Yelp Reservations',
      url: `https://www.yelp.com/search?find_desc=${cleanName}&find_loc=${city}`,
      available: true,
      directBooking: false,
      notes: 'Search on Yelp',
    };
  }

  /**
   * Extract city from place details
   */
  private extractCity(details: any): string {
    // Try to extract city from formatted address
    const address = details.formattedAddress || details.formatted_address || '';
    const parts = address.split(',');

    // Typically city is the second-to-last part in US addresses
    if (parts.length >= 2) {
      return parts[parts.length - 2].trim();
    }

    return 'San Francisco'; // Default fallback
  }

  /**
   * Get city slug for Resy
   */
  private getCitySlug(city: string): string {
    const cityMap: { [key: string]: string } = {
      'San Francisco': 'sf',
      'New York': 'ny',
      'Los Angeles': 'la',
      'Chicago': 'chi',
      'Miami': 'mia',
      'Boston': 'bos',
      'Washington': 'dc',
      'Seattle': 'sea',
      'Austin': 'atx',
      'Portland': 'pdx',
    };

    // Check if city contains any of the mapped cities
    for (const [fullName, slug] of Object.entries(cityMap)) {
      if (city.toLowerCase().includes(fullName.toLowerCase())) {
        return slug;
      }
    }

    // Default to 'sf' if not found
    return 'sf';
  }

  /**
   * Check if restaurant accepts reservations
   */
  private checkIfAcceptsReservations(types: string[], details: any): boolean {
    // Check explicit reservable flag
    if (details.reservable !== undefined) {
      return details.reservable;
    }

    // Check if it's a type that typically accepts reservations
    const reservationTypes = [
      'restaurant',
      'fine_dining_restaurant',
      'steak_house',
      'seafood_restaurant',
      'italian_restaurant',
      'french_restaurant',
      'japanese_restaurant',
      'chinese_restaurant',
      'indian_restaurant',
      'brunch_restaurant',
    ];

    const hasReservationType = types.some(type =>
      reservationTypes.some(rt => type.toLowerCase().includes(rt))
    );

    // Fast food and casual places typically don't take reservations
    const noReservationTypes = [
      'fast_food_restaurant',
      'meal_takeaway',
      'meal_delivery',
      'food_court',
      'cafe',
      'bakery',
    ];

    const hasNoReservationType = types.some(type =>
      noReservationTypes.some(nrt => type.toLowerCase().includes(nrt))
    );

    return hasReservationType && !hasNoReservationType;
  }

  /**
   * Check if restaurant is walk-ins only
   */
  private checkIfWalkInsOnly(
    types: string[],
    acceptsReservations: boolean,
    bookingOptions: BookingOption[]
  ): boolean {
    // If it accepts reservations, it's not walk-ins only
    if (acceptsReservations) return false;

    // If only phone option is available, might be walk-ins preferred
    if (bookingOptions.length === 1 && bookingOptions[0].platform === 'phone') {
      return true;
    }

    // Check for casual dining types
    const walkInTypes = ['cafe', 'bakery', 'fast_food_restaurant', 'food_court', 'bar'];
    return types.some(type => walkInTypes.some(wit => type.toLowerCase().includes(wit)));
  }

  /**
   * Select recommended booking option
   */
  private selectRecommendedOption(options: BookingOption[]): BookingOption | null {
    if (options.length === 0) return null;

    // Priority order: Google Reserve > OpenTable > Resy > Phone > Website > Yelp
    const priorityOrder: Array<BookingOption['platform']> = [
      'google',
      'opentable',
      'resy',
      'phone',
      'website',
      'yelp',
    ];

    for (const platform of priorityOrder) {
      const option = options.find(o => o.platform === platform);
      if (option) return option;
    }

    return options[0];
  }

  /**
   * Generate booking notes based on restaurant type and features
   */
  private generateBookingNotes(details: any, types: string[]): string[] {
    const notes: string[] = [];

    // Check meal services
    if (details.servesBrunch) {
      notes.push('Serves brunch - popular on weekends, book early');
    }

    // Add notes based on restaurant type
    if (types.includes('fine_dining_restaurant')) {
      notes.push('Fine dining - reservations strongly recommended');
      notes.push('Check dress code requirements');
    }

    if (types.includes('bar') || types.includes('nightclub')) {
      notes.push('Bar seating may be first-come, first-served');
    }

    // Add general tips
    if (details.priceLevel >= 3) {
      notes.push('Higher-end restaurant - reservations recommended');
    }

    if (details.rating >= 4.5 && details.user_ratings_total > 500) {
      notes.push('Very popular - book well in advance');
    }

    return notes;
  }
}

// Singleton instance
let instance: BookingService | null = null;

export function getBookingService(): BookingService {
  if (!instance) {
    instance = new BookingService();
  }
  return instance;
}