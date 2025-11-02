/**
 * MapOps - Geocoding Service (TypeScript)
 */



class GeocodingService {
    private apiKey: string;
    private geocoder: google.maps.Geocoder | null = null;

    constructor() {
        this.apiKey = (window as any).CONFIG?.API_KEY || '';
    }

    init(): void {
        if (typeof google !== 'undefined' && google.maps) {
            this.geocoder = new google.maps.Geocoder();
        }
    }

    async geocode(address: string, options: any = {}): Promise<any> {
        try {
            const requestBody: any = { address, languageCode: 'en' };
            if (options.region) requestBody.regionCode = options.region;
            if (options.bounds) {
                requestBody.locationRestriction = {
                    rectangle: {
                        low: { latitude: options.bounds.getSouthWest().lat(), longitude: options.bounds.getSouthWest().lng() },
                        high: { latitude: options.bounds.getNorthEast().lat(), longitude: options.bounds.getNorthEast().lng() }
                    }
                };
            }

            const response = await fetch('https://addressvalidation.googleapis.com/v1:geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey },
                body: JSON.stringify(requestBody)
            });

            if (response.ok) {
                const data = await response.json();
                if (data.result?.geocode) {
                    return {
                        lat: data.result.geocode.location.latitude,
                        lng: data.result.geocode.location.longitude,
                        formattedAddress: address,
                        addressComponents: data.result.addressComponents
                    };
                }
            }
        } catch (error) {
            console.warn('New Geocoding API failed, using legacy:', error);
        }
        return this.geocodeLegacy(address, options);
    }

    geocodeLegacy(address: string, options: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.geocoder) this.init();
            if (!this.geocoder) {
                reject(new Error('Geocoder not available'));
                return;
            }

            const request: google.maps.GeocoderRequest = { address };
            if (options.region) request.region = options.region;
            if (options.bounds) request.bounds = options.bounds;
            if (options.componentRestrictions) request.componentRestrictions = options.componentRestrictions;

            this.geocoder.geocode(request, (results, status) => {
                if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
                    const location = results[0].geometry.location;
                    resolve({
                        lat: location.lat(),
                        lng: location.lng(),
                        formattedAddress: results[0].formatted_address,
                        addressComponents: results[0].address_components,
                        placeId: results[0].place_id,
                        types: results[0].types
                    });
                } else {
                    reject(new Error(`Geocoding failed: ${status}`));
                }
            });
        });
    }

    async reverseGeocode(location: { lat: number; lng: number }, options: any = {}): Promise<any> {
        try {
            const requestBody: any = {
                location: { latitude: location.lat, longitude: location.lng },
                languageCode: 'en'
            };
            if (options.resultType && options.resultType.length > 0) requestBody.resultTypeFilter = options.resultType;
            if (options.locationType && options.locationType.length > 0) requestBody.locationTypeFilter = options.locationType;

            const response = await fetch('https://addressvalidation.googleapis.com/v1:reverseGeocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey },
                body: JSON.stringify(requestBody)
            });

            if (response.ok) {
                const data = await response.json();
                if (data.result) {
                    return {
                        formattedAddress: data.result.formattedAddress,
                        addressComponents: data.result.addressComponents,
                        location: data.result.geocode.location
                    };
                }
            }
        } catch (error) {
            console.warn('New Reverse Geocoding API failed, using legacy:', error);
        }
        return this.reverseGeocodeLegacy(location, options);
    }

    reverseGeocodeLegacy(location: { lat: number; lng: number }, options: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.geocoder) this.init();
            if (!this.geocoder) {
                reject(new Error('Geocoder not available'));
                return;
            }

            const request: google.maps.GeocoderRequest = {
                location: new google.maps.LatLng(location.lat, location.lng)
            };
            // Note: resultType and locationType are not supported in the legacy Geocoder API
            // They're only available in the new Address Validation API

            this.geocoder.geocode(request, (results, status) => {
                if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
                    resolve({
                        formattedAddress: results[0].formatted_address,
                        addressComponents: results[0].address_components,
                        placeId: results[0].place_id,
                        types: results[0].types
                    });
                } else {
                    reject(new Error(`Reverse geocoding failed: ${status}`));
                }
            });
        });
    }

    async validateAddress(address: string): Promise<any> {
        try {
            const response = await fetch('https://addressvalidation.googleapis.com/v1:validateAddress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey },
                body: JSON.stringify({ address: { addressLines: [address], regionCode: 'US' } })
            });

            if (!response.ok) throw new Error(`Address validation error: ${response.statusText}`);
            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('Address validation error:', error);
            throw error;
        }
    }
}

if (typeof window !== 'undefined') {
    (window as any).GeocodingService = GeocodingService;
}
