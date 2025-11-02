/**
 * MapOps - Roads Service (TypeScript)
 */



class RoadsService {
    private apiKey: string;

    constructor() {
        this.apiKey = (window as any).CONFIG?.API_KEY || '';
    }

    async snapToRoads(points: { lat: number; lng: number }[], options: any = {}): Promise<any> {
        const { interpolate = true } = options;
        try {
            const path = points.map(p => `${p.lat},${p.lng}`).join('|');
            const url = new URL('https://roads.googleapis.com/v1/snapToRoads');
            url.searchParams.append('path', path);
            url.searchParams.append('interpolate', String(interpolate));
            url.searchParams.append('key', this.apiKey);

            const response = await fetch(url.toString());
            if (!response.ok) throw new Error(`Roads API error: ${response.statusText}`);
            return await response.json();
        } catch (error) {
            console.error('Snap to roads error:', error);
            throw error;
        }
    }

    async getNearestRoads(points: { lat: number; lng: number }[]): Promise<any> {
        try {
            const pointsParam = points.map(p => `${p.lat},${p.lng}`).join('|');
            const url = new URL('https://roads.googleapis.com/v1/nearestRoads');
            url.searchParams.append('points', pointsParam);
            url.searchParams.append('key', this.apiKey);

            const response = await fetch(url.toString());
            if (!response.ok) throw new Error(`Roads API error: ${response.statusText}`);
            return await response.json();
        } catch (error) {
            console.error('Get nearest roads error:', error);
            throw error;
        }
    }

    async getSpeedLimits(placeIds: string[]): Promise<any[]> {
        try {
            const placeIdsParam = placeIds.join('|');
            const url = new URL('https://roads.googleapis.com/v1/speedLimits');
            url.searchParams.append('placeId', placeIdsParam);
            url.searchParams.append('key', this.apiKey);

            const response = await fetch(url.toString());
            if (!response.ok) throw new Error(`Roads API error: ${response.statusText}`);
            const data = await response.json();
            return data.speedLimits || [];
        } catch (error) {
            console.error('Get speed limits error:', error);
            throw error;
        }
    }

    async snapRoute(routePoints: { lat: number; lng: number }[]): Promise<any[]> {
        try {
            const result = await this.snapToRoads(routePoints, { interpolate: true });
            if (result.snappedPoints) {
                return result.snappedPoints.map((point: any) => ({
                    lat: point.location.latitude,
                    lng: point.location.longitude,
                    placeId: point.placeId,
                    originalIndex: point.originalIndex
                }));
            }
            return [];
        } catch (error) {
            console.error('Snap route error:', error);
            return routePoints;
        }
    }

    async getRoadInfo(point: { lat: number; lng: number }): Promise<any> {
        try {
            const nearest = await this.getNearestRoads([point]);
            if (nearest.snappedPoints?.length > 0) {
                const placeIds = nearest.snappedPoints.map((p: any) => p.placeId).filter(Boolean);
                if (placeIds.length > 0) {
                    const speedLimits = await this.getSpeedLimits(placeIds);
                    return { snappedPoint: nearest.snappedPoints[0], speedLimits };
                }
            }
            return null;
        } catch (error) {
            console.error('Get road info error:', error);
            return null;
        }
    }
}

if (typeof window !== 'undefined') {
    (window as any).RoadsService = RoadsService;
}
