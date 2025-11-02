/**
 * MapOps - Time Zone Service for Next.js
 * Provides timezone data for any location in the world
 */

class TimeZoneService {
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
     * Get timezone information for a specific location
     */
    async getTimeZone(
        location: { lat: number; lng: number },
        timestamp?: number | Date,
        language?: string
    ): Promise<{
        timeZoneId: string;
        timeZoneName: string;
        rawOffset: number;
        dstOffset: number;
        utcOffset: number;
        utcOffsetHours: number;
        currentTime: Date;
        isDst: boolean;
    }> {
        const timestampSeconds = timestamp
            ? timestamp instanceof Date
                ? Math.floor(timestamp.getTime() / 1000)
                : timestamp
            : Math.floor(Date.now() / 1000);

        const url = new URL('https://maps.googleapis.com/maps/api/timezone/json');
        url.searchParams.append('location', `${location.lat},${location.lng}`);
        url.searchParams.append('timestamp', timestampSeconds.toString());
        url.searchParams.append('key', this.apiKey);
        if (language) {
            url.searchParams.append('language', language);
        }

        try {
            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`Timezone API error: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.status !== 'OK') {
                throw new Error(`Timezone API error: ${data.status} - ${data.errorMessage || 'Unknown error'}`);
            }
            
            const utcOffset = data.rawOffset + data.dstOffset;
            const isDst = data.dstOffset > 0;

            return {
                timeZoneId: data.timeZoneId || '',
                timeZoneName: data.timeZoneName || '',
                rawOffset: data.rawOffset || 0,
                dstOffset: data.dstOffset || 0,
                utcOffset: utcOffset,
                utcOffsetHours: utcOffset / 3600,
                currentTime: new Date((timestampSeconds + utcOffset) * 1000),
                isDst: isDst
            };
        } catch (error) {
            console.error('Timezone API error:', error);
            throw error;
        }
    }

    /**
     * Get timezone information for multiple locations
     */
    async getTimeZones(
        locations: { lat: number; lng: number }[],
        timestamp?: number | Date
    ): Promise<Array<{
        location: { lat: number; lng: number };
        timeZoneId: string;
        timeZoneName: string;
        utcOffsetHours: number;
        currentTime: Date;
    }>> {
        const results = await Promise.all(
            locations.map(async (location) => {
                try {
                    const tz = await this.getTimeZone(location, timestamp);
                    return {
                        location,
                        timeZoneId: tz.timeZoneId,
                        timeZoneName: tz.timeZoneName,
                        utcOffsetHours: tz.utcOffsetHours,
                        currentTime: tz.currentTime
                    };
                } catch (error) {
                    console.error(`Failed to get timezone for ${location.lat}, ${location.lng}:`, error);
                    return null;
                }
            })
        );

        return results.filter((r): r is NonNullable<typeof r> => r !== null);
    }

    /**
     * Check if a location is currently in daylight saving time
     */
    async isDaylightSavingTime(location: { lat: number; lng: number }): Promise<boolean> {
        const tz = await this.getTimeZone(location);
        return tz.isDst;
    }

    /**
     * Get current local time for a location
     */
    async getLocalTime(
        location: { lat: number; lng: number },
        format?: 'iso' | 'locale' | 'custom'
    ): Promise<string> {
        const tz = await this.getTimeZone(location);
        const date = tz.currentTime;

        if (format === 'locale') {
            return date.toLocaleString();
        } else if (format === 'custom') {
            return date.toLocaleString('en-US', {
                timeZone: tz.timeZoneId,
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            });
        }

        return date.toISOString();
    }

    /**
     * Calculate time difference between two locations
     */
    async getTimeDifference(
        location1: { lat: number; lng: number },
        location2: { lat: number; lng: number }
    ): Promise<number> {
        const [tz1, tz2] = await Promise.all([
            this.getTimeZone(location1),
            this.getTimeZone(location2)
        ]);

        return tz1.utcOffsetHours - tz2.utcOffsetHours;
    }
}

export default TimeZoneService;

