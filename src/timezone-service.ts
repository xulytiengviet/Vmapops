/**
 * MapOps - Time Zone Service (TypeScript)
 * Provides timezone data for any location in the world
 */

class TimeZoneService {
    private apiKey: string;

    constructor() {
        this.apiKey = (window as any).CONFIG?.API_KEY || '';
    }

    /**
     * Get timezone information for a specific location
     * @param location - Lat/lng coordinates
     * @param timestamp - Optional timestamp (defaults to current time)
     * @param language - Optional language code (defaults to 'en')
     * @returns Timezone data including timezone ID, name, and offsets
     */
    async getTimeZone(
        location: { lat: number; lng: number },
        timestamp?: number | Date,
        language?: string
    ): Promise<{
        timeZoneId: string;
        timeZoneName: string;
        rawOffset: number; // seconds
        dstOffset: number; // seconds
        utcOffset: number; // total offset in seconds
        utcOffsetHours: number; // total offset in hours (e.g., -8 for PST)
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
            
            // Check for API errors
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
     * @param locations - Array of lat/lng coordinates
     * @param timestamp - Optional timestamp (defaults to current time)
     * @returns Array of timezone data
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
     * @param location - Lat/lng coordinates
     * @returns True if DST is active
     */
    async isDaylightSavingTime(location: { lat: number; lng: number }): Promise<boolean> {
        const tz = await this.getTimeZone(location);
        return tz.isDst;
    }

    /**
     * Get current local time for a location
     * @param location - Lat/lng coordinates
     * @param format - Optional format string (defaults to ISO string)
     * @returns Formatted time string
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
     * @param location1 - First location
     * @param location2 - Second location
     * @returns Time difference in hours
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

if (typeof window !== 'undefined') {
    (window as any).TimeZoneService = TimeZoneService;
}

