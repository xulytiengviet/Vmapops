/**
 * MapOps - Places Service
 * Handles all Places API interactions including search, details, autocomplete, etc.
 */

// Types are defined inline to avoid module imports

/**
 * Places Service Class
 * Provides methods for interacting with Google Places APIs
 */
class PlacesService {
    private map: google.maps.Map;
    private placesService: google.maps.places.PlacesService;
    private apiKey: string;

    constructor(map: google.maps.Map) {
        this.map = map;
        this.placesService = new google.maps.places.PlacesService(map);
        this.apiKey = (window as any).CONFIG?.API_KEY || '';
    }

    /**
     * Text Search (New Places API)
     * Search for places using natural language queries
     */
    async textSearch(textQuery: string, options: any = {}): Promise<any[]> {
        const {
            location = null,
            radius = 5000,
            maxResultCount = 20,
            includedTypes = [],
            excludedTypes = [],
            openNow = false,
            language = 'en'
        } = options;

        try {
            const requestBody: any = {
                textQuery: textQuery,
                maxResultCount: maxResultCount,
                languageCode: language
            };

            if (location) {
                requestBody.locationBias = {
                    circle: {
                        center: {
                            latitude: location.lat,
                            longitude: location.lng
                        },
                        radius: radius
                    }
                };
            }

            if (includedTypes.length > 0) {
                requestBody.includedTypes = includedTypes;
            }
            if (excludedTypes.length > 0) {
                requestBody.excludedTypes = excludedTypes;
            }

            if (openNow) {
                requestBody.operatingStatus = 'OPERATIONAL';
            }

            const response = await fetch(
                'https://places.googleapis.com/v1/places:searchText',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': this.apiKey,
                        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.regularOpeningHours,places.currentOpeningHours,places.priceLevel,places.editorialSummary,places.photos,places.internationalPhoneNumber,places.websiteUri'
                    },
                    body: JSON.stringify(requestBody)
                }
            );

            if (!response.ok) {
                throw new Error(`Places API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.places || [];

        } catch (error) {
            console.error('Text search error:', error);
            return this.textSearchLegacy(textQuery, options);
        }
    }

    /**
     * Legacy Text Search using Places Library
     */
    textSearchLegacy(textQuery: string, options: any = {}): Promise<google.maps.places.PlaceResult[]> {
        return new Promise((resolve, reject) => {
            const {
                location = null,
                radius = 5000
            } = options;

            const request: google.maps.places.TextSearchRequest = {
                query: textQuery,
                radius: radius
            };

            if (location) {
                request.location = new google.maps.LatLng(location.lat, location.lng);
            }

            this.placesService.textSearch(request, (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    resolve(results);
                } else {
                    reject(new Error(`Places search failed: ${status}`));
                }
            });
        });
    }

    /**
     * Nearby Search
     */
    nearbySearch(location: { lat: number; lng: number }, options: any = {}): Promise<google.maps.places.PlaceResult[]> {
        return new Promise((resolve, reject) => {
            const {
                radius = 1000,
                type = null,
                keyword = null
            } = options;

            const request: google.maps.places.PlaceSearchRequest = {
                location: new google.maps.LatLng(location.lat, location.lng),
                radius: radius
            };

            if (type) (request as any).type = type;
            if (keyword) request.keyword = keyword;

            this.placesService.nearbySearch(request, (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    resolve(results);
                } else {
                    reject(new Error(`Nearby search failed: ${status}`));
                }
            });
        });
    }

    /**
     * Get Place Details
     */
    getPlaceDetails(placeId: string, fields: any[] = []): Promise<google.maps.places.PlaceResult> {
        return new Promise((resolve, reject) => {
            const defaultFields = [
                'name',
                'formatted_address',
                'formatted_phone_number',
                'geometry',
                'opening_hours',
                'photos',
                'price_level',
                'rating',
                'reviews',
                'types',
                'website',
                'place_id',
                'international_phone_number',
                'editorial_summary',
                'current_opening_hours'
            ];

            const request: google.maps.places.PlaceDetailsRequest = {
                placeId: placeId,
                fields: fields.length > 0 ? fields : defaultFields
            };

            this.placesService.getDetails(request, (place, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                    resolve(place);
                } else {
                    reject(new Error(`Get details failed: ${status}`));
                }
            });
        });
    }

    /**
     * Get Place Details (New Places API)
     */
    async getPlaceDetailsNew(placeId: string, fields: string[] = []): Promise<any> {
        const defaultFields = [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'rating',
            'userRatingCount',
            'types',
            'regularOpeningHours',
            'currentOpeningHours',
            'priceLevel',
            'editorialSummary',
            'photos',
            'internationalPhoneNumber',
            'websiteUri',
            'reviews'
        ];

        const fieldMask = fields.length > 0 
            ? `places.${fields.join(',places.')}`
            : `places.${defaultFields.join(',places.')}`;

        try {
            const response = await fetch(
                `https://places.googleapis.com/v1/places/${placeId}`,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': this.apiKey,
                        'X-Goog-FieldMask': fieldMask
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Places API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data;

        } catch (error) {
            console.error('Get place details error:', error);
            return this.getPlaceDetails(placeId);
        }
    }

    /**
     * Place Autocomplete
     */
    autocomplete(input: string, location: { lat: number; lng: number } | null = null): Promise<google.maps.places.AutocompletePrediction[]> {
        return new Promise((resolve, reject) => {
            const service = new google.maps.places.AutocompleteService();
            
            const request: google.maps.places.AutocompletionRequest = {
                input: input
            };

            if (location) {
                request.location = new google.maps.LatLng(location.lat, location.lng);
                request.radius = 5000;
            }

            service.getPlacePredictions(request, (predictions, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
                    resolve(predictions);
                } else {
                    reject(new Error(`Autocomplete failed: ${status}`));
                }
            });
        });
    }

    /**
     * Check if place is open now
     */
    isOpenNow(place: any): boolean | null {
        if (place.currentOpeningHours) {
            return place.currentOpeningHours.openNow;
        }
        if (place.opening_hours) {
            return place.opening_hours.open_now;
        }
        return null;
    }

    /**
     * Filter places by walking distance
     */
    async filterByWalkingDistance(places: any[], origin: { lat: number; lng: number }, maxWalkingTimeMinutes: number = 10): Promise<any[]> {
        if (!places || places.length === 0) return [];

        const destinations: { lat: number; lng: number }[] = places.map(place => {
            const location = place.location || place.geometry?.location;
            if (location) {
                const lat = location.lat || location.latitude;
                const lng = location.lng || location.longitude;
                return { lat, lng };
            }
            return null;
        }).filter((loc): loc is { lat: number; lng: number } => loc !== null);

        if (destinations.length === 0) return [];

        try {
            const distanceService = new google.maps.DistanceMatrixService();
            const request: google.maps.DistanceMatrixRequest = {
                origins: [new google.maps.LatLng(origin.lat, origin.lng)],
                destinations: destinations.map(dest => new google.maps.LatLng(dest.lat, dest.lng)),
                travelMode: google.maps.TravelMode.WALKING,
                unitSystem: google.maps.UnitSystem.METRIC
            };

            return new Promise((resolve) => {
                distanceService.getDistanceMatrix(request, (response, status) => {
                    if (status === google.maps.DistanceMatrixStatus.OK && response) {
                        const maxWalkingTimeSeconds = maxWalkingTimeMinutes * 60;
                        const filteredPlaces = places.filter((place, index) => {
                            const element = response.rows[0].elements[index];
                            if (!element || element.status !== 'OK') return false;
                            
                            (place as any).distance = element.distance.value;
                            (place as any).duration = element.duration.value;
                            (place as any).distanceText = element.distance.text;
                            (place as any).durationText = element.duration.text;
                            
                            return element.duration.value <= maxWalkingTimeSeconds;
                        });
                        resolve(filteredPlaces);
                    } else {
                        console.error('Distance Matrix error:', status);
                        resolve(places);
                    }
                });
            });
        } catch (error) {
            console.error('Distance filtering error:', error);
            return places;
        }
    }

    /**
     * Filter places by specific attributes
     */
    filterPlaces(places: any[], filters: any = {}): any[] {
        return places.filter(place => {
            if (filters.openNow) {
                const isOpen = this.isOpenNow(place);
                if (isOpen !== null && !isOpen) return false;
            }

            if (filters.minRating) {
                const rating = place.rating || place.userRatingCount;
                if (!rating || rating < filters.minRating) return false;
            }

            if (filters.maxPriceLevel !== undefined) {
                const priceLevel = place.priceLevel || place.price_level;
                if (priceLevel !== undefined && priceLevel > filters.maxPriceLevel) return false;
            }

            if (filters.outdoorSeating) {
                // Requires place details - handled separately
            }

            return true;
        });
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    (window as any).PlacesService = PlacesService;
}
