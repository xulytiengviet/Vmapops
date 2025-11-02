/**
 * MapOps - Places Aggregate Service (TypeScript)
 */



class PlacesAggregateService {
    private apiKey: string;

    constructor() {
        this.apiKey = (window as any).CONFIG?.API_KEY || '';
    }

    async searchNearby(location: { lat: number; lng: number }, radius: number, options: any = {}): Promise<any> {
        const {
            includedTypes = [],
            excludedTypes = [],
            minRating = null,
            maxPriceLevel = null,
            openNow = false,
            language = 'en'
        } = options;

        try {
            const requestBody: any = {
                locationRestriction: {
                    circle: {
                        center: { latitude: location.lat, longitude: location.lng },
                        radius
                    }
                },
                languageCode: language
            };

            if (includedTypes.length > 0) requestBody.includedTypes = includedTypes;
            if (excludedTypes.length > 0) requestBody.excludedTypes = excludedTypes;
            if (minRating !== null) requestBody.ratingFilter = { minRating };
            if (maxPriceLevel !== null) requestBody.priceLevelFilter = { maxPriceLevel };
            if (openNow) requestBody.operatingStatus = 'OPERATIONAL';

            const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': this.apiKey,
                    'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.regularOpeningHours,places.currentOpeningHours,places.priceLevel'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) throw new Error(`Places Aggregate API error: ${response.statusText}`);
            return await response.json();
        } catch (error) {
            console.error('Places Aggregate search error:', error);
            throw error;
        }
    }

    async countByType(location: { lat: number; lng: number }, radius: number, placeTypes: string[]): Promise<Record<string, number>> {
        const counts: Record<string, number> = {};
        for (const type of placeTypes) {
            try {
                const result = await this.searchNearby(location, radius, { includedTypes: [type] });
                counts[type] = result.places ? result.places.length : 0;
            } catch (error) {
                console.error(`Error counting ${type}:`, error);
                counts[type] = 0;
            }
        }
        return counts;
    }

    async getDensityInsights(locations: { lat: number; lng: number }[], radius: number, types: string[] = ['restaurant', 'cafe', 'bar']): Promise<any[]> {
        const insights: any[] = [];
        for (const location of locations) {
            try {
                const counts = await this.countByType(location, radius, types);
                const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
                insights.push({ location, radius, counts, total, density: total / (Math.PI * radius * radius) * 1000000 });
            } catch (error) {
                console.error('Error getting density for location:', error);
            }
        }
        return insights;
    }

    async findHighDensityAreas(bounds: { north: number; south: number; east: number; west: number }, gridSize: number = 500, types: string[] = ['restaurant', 'cafe']): Promise<any[]> {
        const grid: { lat: number; lng: number }[] = [];
        const latStep = (bounds.north - bounds.south) / (gridSize / 111000);
        const lngStep = (bounds.east - bounds.west) / (gridSize / 111000);
        for (let lat = bounds.south; lat <= bounds.north; lat += latStep) {
            for (let lng = bounds.west; lng <= bounds.east; lng += lngStep) {
                grid.push({ lat, lng });
            }
        }
        const densities = await this.getDensityInsights(grid, gridSize / 2, types);
        return densities.sort((a, b) => b.density - a.density).slice(0, 10);
    }
}

if (typeof window !== 'undefined') {
    (window as any).PlacesAggregateService = PlacesAggregateService;
}
