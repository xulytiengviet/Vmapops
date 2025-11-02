/**
 * MapOps - Geolocation Service for Next.js
 * Provides location data from cell towers and WiFi nodes
 * Useful when GPS is unavailable or for better accuracy
 */

class GeolocationService {
    private apiKey: string;

    constructor() {
        // Get API key from Next.js environment variable
        // Next.js replaces NEXT_PUBLIC_ variables at build time
        if (typeof window !== 'undefined') {
            // Try to get from window if set globally, otherwise use env var
            this.apiKey = (window as any).GOOGLE_MAPS_API_KEY || 
                         process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || 
                         '';
        } else {
            this.apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
        }
    }

    /**
     * Get location using Google Geolocation API
     */
    async getLocation(options: {
        considerIp?: boolean;
        wifiAccessPoints?: Array<{
            macAddress: string;
            signalStrength?: number;
            signalToNoiseRatio?: number;
            channel?: number;
        }>;
        cellTowers?: Array<{
            cellId: number;
            locationAreaCode: number;
            mobileCountryCode: number;
            mobileNetworkCode: number;
            age?: number;
            signalStrength?: number;
            timingAdvance?: number;
        }>;
    } = {}): Promise<{
        location: { lat: number; lng: number };
        accuracy: number;
        timestamp: Date;
    }> {
        const requestBody: any = {};

        if (options.considerIp !== undefined) {
            requestBody.considerIp = options.considerIp;
        }

        if (options.wifiAccessPoints && options.wifiAccessPoints.length > 0) {
            requestBody.wifiAccessPoints = options.wifiAccessPoints.map(ap => ({
                macAddress: ap.macAddress,
                ...(ap.signalStrength !== undefined && { signalStrength: ap.signalStrength }),
                ...(ap.signalToNoiseRatio !== undefined && { signalToNoiseRatio: ap.signalToNoiseRatio }),
                ...(ap.channel !== undefined && { channel: ap.channel })
            }));
        }

        if (options.cellTowers && options.cellTowers.length > 0) {
            requestBody.cellTowers = options.cellTowers.map(tower => ({
                cellId: tower.cellId,
                locationAreaCode: tower.locationAreaCode,
                mobileCountryCode: tower.mobileCountryCode,
                mobileNetworkCode: tower.mobileNetworkCode,
                ...(tower.age !== undefined && { age: tower.age }),
                ...(tower.signalStrength !== undefined && { signalStrength: tower.signalStrength }),
                ...(tower.timingAdvance !== undefined && { timingAdvance: tower.timingAdvance })
            }));
        }

        try {
            const response = await fetch(`https://www.googleapis.com/geolocation/v1/geolocate?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Geolocation API error: ${response.statusText} - ${JSON.stringify(errorData)}`);
            }

            const data = await response.json();

            return {
                location: {
                    lat: data.location.lat,
                    lng: data.location.lng
                },
                accuracy: data.accuracy || 0,
                timestamp: new Date()
            };
        } catch (error) {
            console.error('Geolocation API error:', error);
            throw error;
        }
    }

    /**
     * Get location using IP address
     */
    async getLocationByIp(): Promise<{
        location: { lat: number; lng: number };
        accuracy: number;
        timestamp: Date;
    }> {
        return this.getLocation({ considerIp: true });
    }

    /**
     * Get location using WiFi access points
     */
    async getLocationByWiFi(wifiAccessPoints?: Array<{
        macAddress: string;
        signalStrength?: number;
        signalToNoiseRatio?: number;
        channel?: number;
    }>): Promise<{
        location: { lat: number; lng: number };
        accuracy: number;
        timestamp: Date;
    }> {
        if (wifiAccessPoints && wifiAccessPoints.length > 0) {
            return this.getLocation({ wifiAccessPoints });
        }
        return this.getLocation({ considerIp: true });
    }

    /**
     * Get location using cell tower data
     */
    async getLocationByCellTowers(cellTowers: Array<{
        cellId: number;
        locationAreaCode: number;
        mobileCountryCode: number;
        mobileNetworkCode: number;
        age?: number;
        signalStrength?: number;
        timingAdvance?: number;
    }>): Promise<{
        location: { lat: number; lng: number };
        accuracy: number;
        timestamp: Date;
    }> {
        return this.getLocation({ cellTowers });
    }

    /**
     * Hybrid location: Try GPS first, fallback to Google Geolocation API
     */
    async getLocationHybrid(timeout: number = 5000): Promise<{
        location: { lat: number; lng: number };
        accuracy: number;
        timestamp: Date;
        source: 'gps' | 'geolocation-api' | 'ip';
    }> {
        // Try browser geolocation first (GPS)
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            try {
                const gpsLocation = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(
                        resolve,
                        reject,
                        {
                            enableHighAccuracy: true,
                            timeout: timeout,
                            maximumAge: 0
                        }
                    );
                });

                return {
                    location: {
                        lat: gpsLocation.coords.latitude,
                        lng: gpsLocation.coords.longitude
                    },
                    accuracy: gpsLocation.coords.accuracy || 0,
                    timestamp: new Date(),
                    source: 'gps'
                };
            } catch (gpsError) {
                console.warn('GPS geolocation failed, trying Google Geolocation API:', gpsError);
            }
        }

        // Fallback to Google Geolocation API (cell towers/WiFi/IP)
        try {
            const apiLocation = await this.getLocationByIp();
            return {
                ...apiLocation,
                source: 'ip' as const
            };
        } catch (apiError) {
            console.error('All geolocation methods failed:', apiError);
            throw new Error('Unable to determine location using GPS or Geolocation API');
        }
    }
}

export default GeolocationService;

