/**
 * Places Service
 * Wrapper for Google Places API (both text search and nearby search)
 * Works in Next.js API routes (server-side)
 */

export interface PlaceLocation {
  lat: number;
  lng: number;
}

export interface PlaceSearchOptions {
  location?: PlaceLocation;
  radius?: number;
  type?: string;
  minRating?: number;
  maxResults?: number;
  openNow?: boolean;
  pageToken?: string;
}

export interface Place {
  placeId: string;
  name: string;
  address: string;
  location: PlaceLocation;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  openNow?: boolean;
  types: string[];
  photos?: Array<{
    photoReference: string;
    width: number;
    height: number;
  }>;
}

export class PlacesService {
  private apiKey: string;
  private baseUrl = "https://maps.googleapis.com/maps/api/place";

  constructor() {
    this.apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
    if (!this.apiKey) {
      throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is required");
    }
  }

  /**
   * Search for places using text query (e.g., "coffee", "Italian restaurant")
   * Combines text search with optional location bias
   */
  async textSearch(
    query: string,
    options?: PlaceSearchOptions
  ): Promise<Place[]> {
    try {
      const url = new URL(`${this.baseUrl}/textsearch/json`);
      url.searchParams.set("query", query);
      url.searchParams.set("key", this.apiKey);

      if (options?.location) {
        url.searchParams.set(
          "location",
          `${options.location.lat},${options.location.lng}`
        );
      }

      if (options?.radius) {
        url.searchParams.set("radius", String(options.radius));
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Places API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        throw new Error(`Places API returned status: ${data.status}`);
      }

      return (data.results || [])
        .slice(0, options?.maxResults || 20)
        .map((result: any) => this.mapPlaceResult(result));
    } catch (error) {
      console.error("PlacesService.textSearch error:", error);
      throw error;
    }
  }

  /**
   * Search for places near a specific location
   * More efficient for location-based searches
   */
  async nearbySearch(options: PlaceSearchOptions): Promise<Place[]> {
    try {
      if (!options.location) {
        throw new Error("Location is required for nearby search");
      }

      const url = new URL(`${this.baseUrl}/nearbysearch/json`);
      url.searchParams.set(
        "location",
        `${options.location.lat},${options.location.lng}`
      );
      url.searchParams.set("radius", String(options.radius || 1000));
      url.searchParams.set("key", this.apiKey);

      // Type can be singular or plural (cafe or cafes)
      if (options.type) {
        const typeParam = options.type.endsWith("s")
          ? options.type
          : options.type + "s";
        url.searchParams.set("type", typeParam);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Places API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        throw new Error(`Places API returned status: ${data.status}`);
      }

      let results = (data.results || []).map((result: any) =>
        this.mapPlaceResult(result)
      );

      // Apply optional filters
      if (options.minRating) {
        results = results.filter((p: Place) => (p.rating || 0) >= options.minRating!);
      }

      if (options.openNow) {
        results = results.filter((p: Place) => p.openNow === true);
      }

      return results.slice(0, options.maxResults || 20);
    } catch (error) {
      console.error("PlacesService.nearbySearch error:", error);
      throw error;
    }
  }

  /**
   * Get detailed information about a specific place
   */
  async getPlaceDetails(
    placeId: string,
    fields?: string[]
  ): Promise<any> {
    try {
      const url = new URL(`${this.baseUrl}/details/json`);
      url.searchParams.set("place_id", placeId);
      url.searchParams.set("key", this.apiKey);

      if (fields && fields.length > 0) {
        url.searchParams.set("fields", fields.join(","));
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Places API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== "OK") {
        throw new Error(`Places API returned status: ${data.status}`);
      }

      return data.result;
    } catch (error) {
      console.error("PlacesService.getPlaceDetails error:", error);
      throw error;
    }
  }

  /**
   * Autocomplete place names as user types
   */
  async autoComplete(input: string, location?: PlaceLocation): Promise<any[]> {
    try {
      const url = new URL(`${this.baseUrl}/autocomplete/json`);
      url.searchParams.set("input", input);
      url.searchParams.set("key", this.apiKey);

      if (location) {
        url.searchParams.set("location", `${location.lat},${location.lng}`);
        url.searchParams.set("radius", "5000"); // 5km autocomplete radius
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Places API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        throw new Error(`Places API returned status: ${data.status}`);
      }

      return data.predictions || [];
    } catch (error) {
      console.error("PlacesService.autoComplete error:", error);
      throw error;
    }
  }

  /**
   * Helper to map Google Places API result to our Place interface
   */
  private mapPlaceResult(result: any): Place {
    return {
      placeId: result.place_id,
      name: result.name,
      address: result.formatted_address || result.vicinity || "",
      location: {
        lat: result.geometry?.location?.lat || 0,
        lng: result.geometry?.location?.lng || 0,
      },
      rating: result.rating,
      userRatingsTotal: result.user_ratings_total,
      priceLevel: result.price_level,
      openNow: result.opening_hours?.open_now,
      types: result.types || [],
      photos: result.photos?.map((photo: any) => ({
        photoReference: photo.photo_reference,
        width: photo.width,
        height: photo.height,
      })),
    };
  }
}
