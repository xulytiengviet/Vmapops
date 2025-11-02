/**
 * InfoWindow Manager
 * Handles displaying detailed place information in custom info windows
 */

interface PlaceDetails {
    id?: string;
    place_id?: string;
    displayName?: string;
    name?: string;
    formattedAddress?: string;
    formatted_address?: string;
    location?: { lat: number; lng: number };
    geometry?: { location: { lat: () => number; lng: () => number } };
    rating?: number;
    userRatingCount?: number;
    user_ratings_total?: number;
    types?: string[];
    regularOpeningHours?: any;
    opening_hours?: any;
    currentOpeningHours?: any;
    priceLevel?: string | number;
    price_level?: number;
    editorialSummary?: { text?: string };
    editorial_summary?: { overview?: string };
    photos?: any[];
    internationalPhoneNumber?: string;
    international_phone_number?: string;
    websiteUri?: string;
    website?: string;
    reviews?: any[];
    formatted_phone_number?: string;
}

class InfoWindowManager {
    private currentInfoWindow: google.maps.InfoWindow | null = null;
    private map: google.maps.Map;
    private placesService: any;

    constructor(map: google.maps.Map, placesService: any) {
        this.map = map;
        this.placesService = placesService;
    }

    /**
     * Show place details using existing place data (from search results)
     */
    showPlaceDetailsFromData(place: any, marker: google.maps.Marker): void {
        try {
            console.log('showPlaceDetailsFromData called with place:', place);
            this.closeInfoWindow();
            
            // Create info window content from existing place data
            const content = this.createInfoWindowContent(place);
            console.log('Info window content created, length:', content.length);
            
            // Create and display info window
            this.currentInfoWindow = new google.maps.InfoWindow({
                content: content,
                maxWidth: 420
            });
            
            this.currentInfoWindow.open(this.map, marker);
            console.log('Info window opened with existing data');
        } catch (error) {
            console.error('Error showing place details from data:', error);
            this.showBasicInfoWindow(marker.getTitle() || 'Place', marker);
        }
    }

    /**
     * Fetch place details and display in info window
     */
    async showPlaceDetails(placeId: string, marker: google.maps.Marker): Promise<void> {
        try {
            // Close previous info window
            this.closeInfoWindow();

            console.log('Fetching place details for:', placeId);
            
            // Try new API first (with fallback to legacy)
            let placeDetails: any;
            
            // Check if getPlaceDetailsNew method exists and try it first
            if (this.placesService && typeof this.placesService.getPlaceDetailsNew === 'function') {
                try {
                    console.log('Trying new Places API...');
                    placeDetails = await this.placesService.getPlaceDetailsNew(placeId, [
                        'displayName',
                        'formattedAddress',
                        'rating',
                        'userRatingCount',
                        'photos',
                        'regularOpeningHours',
                        'currentOpeningHours',
                        'internationalPhoneNumber',
                        'websiteUri',
                        'priceLevel',
                        'reviews',
                        'editorialSummary',
                        'types'
                    ]);
                    console.log('New API success:', placeDetails);
                } catch (newApiError) {
                    console.warn('New API failed, trying legacy:', newApiError);
                    // Fallback to legacy API
                    if (this.placesService && typeof this.placesService.getPlaceDetails === 'function') {
                        placeDetails = await this.placesService.getPlaceDetails(placeId, [
                            'name',
                            'formatted_address',
                            'rating',
                            'user_ratings_total',
                            'photos',
                            'opening_hours',
                            'formatted_phone_number',
                            'website',
                            'price_level',
                            'reviews',
                            'editorial_summary',
                            'types'
                        ]);
                        console.log('Legacy API success:', placeDetails);
                    } else {
                        throw new Error('Neither API method available');
                    }
                }
            } else if (this.placesService && typeof this.placesService.getPlaceDetails === 'function') {
                // Fallback to legacy API if new method doesn't exist
                console.log('Using legacy Places API...');
                placeDetails = await this.placesService.getPlaceDetails(placeId, [
                    'name',
                    'formatted_address',
                    'rating',
                    'user_ratings_total',
                    'photos',
                    'opening_hours',
                    'formatted_phone_number',
                    'website',
                    'price_level',
                    'reviews',
                    'editorial_summary',
                    'types'
                ]);
                console.log('Legacy API success:', placeDetails);
            } else {
                throw new Error('PlacesService not available or missing methods');
            }

            if (!placeDetails) {
                throw new Error('No place details returned');
            }

            // Create info window content
            const content = this.createInfoWindowContent(placeDetails);
            console.log('Info window content generated, length:', content.length);

            // Create and display info window
            this.currentInfoWindow = new google.maps.InfoWindow({
                content: content,
                maxWidth: 420
            });

            this.currentInfoWindow.open(this.map, marker);
            console.log('Info window opened');
        } catch (error) {
            console.error('Error showing place details:', error);
            console.error('Error details:', error instanceof Error ? error.message : String(error));
            // Show basic info window if details fetch fails
            this.showBasicInfoWindow(marker.getTitle() || 'Place', marker);
        }
    }

    /**
     * Show basic info window
     */
    private showBasicInfoWindow(title: string, marker: google.maps.Marker): void {
        const basicContent = this.createBasicInfoWindowContent(title);
        this.currentInfoWindow = new google.maps.InfoWindow({
            content: basicContent,
            maxWidth: 300
        });
        this.currentInfoWindow.open(this.map, marker);
    }

    /**
     * Create HTML content for info window with full details
     */
    private createInfoWindowContent(place: PlaceDetails): string {
        const name = place.displayName || place.name || 'Unknown Place';
        const address = place.formattedAddress || place.formatted_address || '';
        const rating = place.rating || 0;
        const reviewCount = place.userRatingCount || place.user_ratings_total || 0;
        const phone = place.internationalPhoneNumber || place.formatted_phone_number || '';
        const website = place.websiteUri || place.website || '';
        const priceLevel = this.formatPriceLevel(place.priceLevel || place.price_level);
        const isOpen = this.getOpenStatus(place);
        const hours = this.formatHours(place);
        const photoUrl = this.getPhotoUrl(place);
        const reviews = (place.reviews || []).slice(0, 5);

        let html = `
            <div class="info-window" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 420px; padding: 0;">
                <div class="info-header" style="border-bottom: 1px solid #e0e0e0; padding: 16px; padding-bottom: 12px;">
                    <h3 class="place-name" style="font-size: 18px; font-weight: 600; margin: 0 0 8px 0; color: #202124;">${this.escapeHtml(name)}</h3>
                    <div class="place-rating" style="display: flex; align-items: center; gap: 6px; font-size: 13px;">
                        <span class="stars" style="color: #fbbc04; font-size: 14px; letter-spacing: 1px;">${this.renderStars(rating)}</span>
                        <span class="rating-value" style="font-weight: 600; color: #5f6368;">${rating > 0 ? rating.toFixed(1) : 'N/A'}</span>
                        <span class="review-count" style="color: #70757a;">(${reviewCount})</span>
                    </div>
                </div>
        `;

        // Photo
        if (photoUrl) {
            html += `
                <div class="info-photos" style="padding: 0 16px; margin: 12px 0;">
                    <img src="${photoUrl}" alt="Place photo" class="place-photo" style="width: 100%; height: 200px; object-fit: cover; border-radius: 8px; display: block;" onerror="this.style.display='none'">
                </div>
            `;
        }

        // Details section
        html += `
            <div class="info-details" style="padding: 0 16px; margin: 12px 0;">
                <p class="address" style="margin: 8px 0; font-size: 13px; color: #5f6368; display: flex; align-items: start; gap: 8px;">
                    <span class="icon" style="flex-shrink: 0; font-size: 14px;">📍</span>
                    <span>${this.escapeHtml(address)}</span>
                </p>
        `;

        if (phone) {
            html += `
                <p class="phone" style="margin: 8px 0; font-size: 13px; color: #5f6368; display: flex; align-items: start; gap: 8px;">
                    <span class="icon" style="flex-shrink: 0; font-size: 14px;">📞</span>
                    <a href="tel:${phone}" style="color: #1a73e8; text-decoration: none;">${phone}</a>
                </p>
            `;
        }

        if (hours) {
            html += `
                <p class="hours" style="margin: 8px 0; font-size: 13px; color: #5f6368; display: flex; align-items: start; gap: 8px;">
                    <span class="icon" style="flex-shrink: 0; font-size: 14px;">🕒</span>
                    <span>${hours}</span>
                </p>
            `;
        }

        if (priceLevel) {
            html += `
                <p class="price" style="margin: 8px 0; font-size: 13px; color: #5f6368; display: flex; align-items: start; gap: 8px;">
                    <span class="icon" style="flex-shrink: 0; font-size: 14px;">💰</span>
                    <span>${priceLevel}</span>
                </p>
            `;
        }

        html += `</div>`;

        // Reviews section
        if (reviews.length > 0) {
            html += `<div class="info-reviews" style="padding: 12px 16px; border-top: 1px solid #e0e0e0; margin-top: 12px;">`;
            html += `<h4 class="reviews-title" style="font-size: 14px; font-weight: 600; color: #202124; margin: 0 0 12px 0;">Reviews</h4>`;

            reviews.forEach((review) => {
                const author = review.author_name || review.authorName || 'Anonymous';
                const reviewRating = review.rating || 0;
                const reviewText = review.text || '';
                const relativeTime = review.relative_time_description || review.relativeTimeDescription || 'Recently';
                const profilePhoto = review.profile_photo_url || review.profilePhotoUrl || '';

                html += `
                    <div class="review" style="margin-bottom: 12px; padding: 12px; background: #f8f9fa; border-radius: 8px;">
                        <div class="review-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                `;

                if (profilePhoto) {
                    html += `<img src="${profilePhoto}" alt="${author}" class="profile-pic" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">`;
                }

                html += `
                            <span class="author" style="font-weight: 600; font-size: 13px; color: #202124;">${this.escapeHtml(author)}</span>
                            <span class="review-rating" style="color: #fbbc04; font-size: 12px; letter-spacing: 1px; margin-left: auto;">${this.renderStars(reviewRating)}</span>
                        </div>
                        <p class="review-text" style="font-size: 13px; color: #3c4043; margin: 8px 0; line-height: 1.4;">${this.escapeHtml(reviewText)}</p>
                        <span class="review-time" style="font-size: 12px; color: #70757a;">${relativeTime}</span>
                    </div>
                `;
            });

            html += `</div>`;
        }

        // Actions
        html += `
            <div class="info-actions" style="display: flex; gap: 8px; padding: 16px; border-top: 1px solid #e0e0e0; flex-wrap: wrap;">
        `;

        if (website) {
            html += `<a href="${website}" target="_blank" class="btn-action" style="flex: 1; min-width: 100px; padding: 10px 16px; background: #f8f9fa; color: #1a73e8; border: 1px solid #dadce0; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500; text-align: center; cursor: pointer; transition: background-color 0.2s;">Visit Website</a>`;
        }

        const googleMapsUrl = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
        html += `<a href="${googleMapsUrl}" target="_blank" class="btn-action" style="flex: 1; min-width: 100px; padding: 10px 16px; background: #f8f9fa; color: #1a73e8; border: 1px solid #dadce0; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500; text-align: center; cursor: pointer; transition: background-color 0.2s;">View on Google Maps</a>`;

        html += `
            </div>
            </div>
        `;

        return html;
    }

    /**
     * Create minimal info window content (fallback)
     */
    private createBasicInfoWindowContent(title: string): string {
        return `
            <div class="info-window info-window-basic">
                <h3 class="place-name">${this.escapeHtml(title)}</h3>
                <p>Click on a marker to see details</p>
            </div>
        `;
    }

    /**
     * Get photo URL from place details
     */
    private getPhotoUrl(place: PlaceDetails): string {
        if (!place.photos || place.photos.length === 0) {
            return '';
        }

        const photo = place.photos[0];

        // Try Google Places Photo method first
        if (typeof photo.getUrl === 'function') {
            try {
                return photo.getUrl({ maxWidth: 400, maxHeight: 300 });
            } catch (e) {
                // Continue to next method
            }
        }

        // Try using photo_reference for REST API
        if (photo.photo_reference) {
            const config = (window as any).CONFIG;
            if (config && config.API_KEY) {
                return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photo.photo_reference}&key=${config.API_KEY}`;
            }
        }

        return '';
    }

    /**
     * Format operating hours for display
     */
    private formatHours(place: PlaceDetails): string {
        const hours = place.opening_hours || place.regularOpeningHours || place.currentOpeningHours;

        if (!hours) {
            return '';
        }

        // Check if open now
        const openNow = hours.open_now;
        const status = openNow ? '🟢 Open now' : '🔴 Closed';

        // Get current day hours
        if (hours.weekday_text && hours.weekday_text.length > 0) {
            const today = new Date().getDay();
            const dayIndex = today === 0 ? 6 : today - 1; // Convert Sunday=0 to Monday=0
            if (hours.weekday_text[dayIndex]) {
                return `${status} · ${hours.weekday_text[dayIndex].split(': ')[1] || 'See hours'}`;
            }
        }

        return status;
    }

    /**
     * Get current open/closed status
     */
    private getOpenStatus(place: PlaceDetails): boolean {
        const hours = place.opening_hours || place.regularOpeningHours || place.currentOpeningHours;
        return hours?.open_now ?? false;
    }

    /**
     * Format price level for display
     */
    private formatPriceLevel(priceLevel: any): string {
        if (!priceLevel) return '';

        // Handle numeric price levels
        if (typeof priceLevel === 'number') {
            return '$'.repeat(Math.min(priceLevel, 4)) || '';
        }

        // Handle string price levels (from new API)
        const levelMap: { [key: string]: string } = {
            'PRICE_LEVEL_INEXPENSIVE': '$',
            'PRICE_LEVEL_MODERATE': '$$',
            'PRICE_LEVEL_EXPENSIVE': '$$$',
            'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$'
        };

        return levelMap[priceLevel.toString()] || '';
    }

    /**
     * Render star rating as HTML
     */
    private renderStars(rating: number): string {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        let stars = '★'.repeat(fullStars);

        if (hasHalfStar && fullStars < 5) {
            stars += '✌';
        }

        stars += '☆'.repeat(5 - Math.ceil(rating));

        return stars;
    }

    /**
     * Escape HTML special characters
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Close current info window
     */
    closeInfoWindow(): void {
        if (this.currentInfoWindow) {
            this.currentInfoWindow.close();
            this.currentInfoWindow = null;
        }
    }

    /**
     * Update map reference (if needed)
     */
    setMap(map: google.maps.Map): void {
        this.map = map;
    }
}

// Export InfoWindowManager to global scope
if (typeof window !== 'undefined') {
    (window as any).InfoWindowManager = InfoWindowManager;
}
