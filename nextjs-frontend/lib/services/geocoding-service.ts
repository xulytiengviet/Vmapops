/**
 * Geocoding Service
 * Wrapper for Google Geocoding API (address to coordinates and vice versa)
 * Works in Next.js API routes (server-side)
 */

export interface GeocodeLocation {
  lat: number;
  lng: number;
}

export interface AddressComponent {
  longName: string;
  shortName: string;
  types: string[];
}

export interface GeocodeResult {
  formattedAddress: string;
  location: GeocodeLocation;
  locationType: string;
  placeId: string;
  addressComponents: AddressComponent[];
  bounds?: {
    northeast: GeocodeLocation;
    southwest: GeocodeLocation;
  };
}

export class GeocodingService {
  private apiKey: string;
  private baseUrl = "https://maps.googleapis.com/maps/api/geocode/json";

  constructor() {
    this.apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
    if (!this.apiKey) {
      throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is required");
    }
  }

  /**
   * Convert address string to coordinates
   * Example: "1600 Pennsylvania Avenue NW, Washington, DC" → {lat, lng}
   */
  async geocode(address: string): Promise<GeocodeResult[]> {
    try {
      const url = new URL(this.baseUrl);
      url.searchParams.set("address", address);
      url.searchParams.set("key", this.apiKey);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Geocoding API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        throw new Error(`Geocoding API returned status: ${data.status}`);
      }

      if (data.status === "ZERO_RESULTS") {
        return [];
      }

      return data.results.map((result: any) => this.mapGeocodeResult(result));
    } catch (error) {
      console.error("GeocodingService.geocode error:", error);
      throw error;
    }
  }

  /**
   * Convert coordinates to address
   * Example: {lat: 40.7128, lng: -74.0060} → "New York, NY, USA"
   */
  async reverseGeocode(location: GeocodeLocation): Promise<GeocodeResult[]> {
    try {
      const url = new URL(this.baseUrl);
      url.searchParams.set(
        "latlng",
        `${location.lat},${location.lng}`
      );
      url.searchParams.set("key", this.apiKey);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Geocoding API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        throw new Error(`Geocoding API returned status: ${data.status}`);
      }

      if (data.status === "ZERO_RESULTS") {
        return [];
      }

      return data.results.map((result: any) => this.mapGeocodeResult(result));
    } catch (error) {
      console.error("GeocodingService.reverseGeocode error:", error);
      throw error;
    }
  }

  /**
   * Helper to map Google Geocoding API result to our GeocodeResult interface
   */
  private mapGeocodeResult(result: any): GeocodeResult {
    return {
      formattedAddress: result.formatted_address,
      location: {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
      },
      locationType: result.geometry.location_type,
      placeId: result.place_id,
      addressComponents: (result.address_components || []).map(
        (component: any) => ({
          longName: component.long_name,
          shortName: component.short_name,
          types: component.types,
        })
      ),
      bounds: result.geometry.bounds
        ? {
            northeast: {
              lat: result.geometry.bounds.northeast.lat,
              lng: result.geometry.bounds.northeast.lng,
            },
            southwest: {
              lat: result.geometry.bounds.southwest.lat,
              lng: result.geometry.bounds.southwest.lng,
            },
          }
        : undefined,
    };
  }
}
