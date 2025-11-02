/**
 * MapOps - Routes Service (TypeScript)
 * Handles routing, directions, distance calculations, and route optimization
 */



class RoutesService {
    private map: google.maps.Map;
    private apiKey: string;

    constructor(map: google.maps.Map) {
        this.map = map;
        this.apiKey = (window as any).CONFIG?.API_KEY || '';
    }

    async getRoute(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, options: any = {}): Promise<any> {
        const {
            travelMode = 'WALK',
            waypoints = [],
            avoidHighways = false,
            avoidTolls = false,
            avoidFerries = false,
            optimize = false
        } = options;

        try {
            const requestBody: any = {
                origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
                destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
                travelMode,
                routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
                languageCode: 'en',
                units: 'METRIC'
            };

            if (waypoints.length > 0) {
                requestBody.intermediates = waypoints.map(wp => ({
                    location: { latLng: { latitude: wp.lat, longitude: wp.lng } }
                }));
                if (optimize) requestBody.optimizeWaypointOrder = true;
            }

            const routeModifiers: any = {};
            if (avoidHighways) routeModifiers.avoidHighways = true;
            if (avoidTolls) routeModifiers.avoidTolls = true;
            if (avoidFerries) routeModifiers.avoidFerries = true;
            if (Object.keys(routeModifiers).length > 0) requestBody.routeModifiers = routeModifiers;

            const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': this.apiKey,
                    'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) throw new Error(`Routes API error: ${response.statusText}`);
            return await response.json();
        } catch (error) {
            console.error('Get route error:', error);
            return this.getRouteLegacy(origin, destination, options);
        }
    }

    getRouteLegacy(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, options: any = {}): Promise<google.maps.DirectionsResult> {
        return new Promise((resolve, reject) => {
            const directionsService = new google.maps.DirectionsService();
            const request: google.maps.DirectionsRequest = {
                origin: new google.maps.LatLng(origin.lat, origin.lng),
                destination: new google.maps.LatLng(destination.lat, destination.lng),
                travelMode: (options.travelMode === 'WALK' ? google.maps.TravelMode.WALKING : 
                            options.travelMode === 'DRIVE' ? google.maps.TravelMode.DRIVING :
                            options.travelMode === 'BICYCLE' ? google.maps.TravelMode.BICYCLING :
                            google.maps.TravelMode.WALKING) as google.maps.TravelMode,
                avoidHighways: options.avoidHighways || false,
                avoidTolls: options.avoidTolls || false,
                avoidFerries: options.avoidFerries || false
            };

            if (options.waypoints && options.waypoints.length > 0) {
                request.waypoints = options.waypoints.map(wp => ({
                    location: new google.maps.LatLng(wp.lat, wp.lng),
                    stopover: true
                }));
                request.optimizeWaypoints = options.optimize || false;
            }

            directionsService.route(request, (result, status) => {
                if (status === google.maps.DirectionsStatus.OK && result) {
                    resolve(result);
                } else {
                    reject(new Error(`Directions failed: ${status}`));
                }
            });
        });
    }

    async getDistanceMatrix(origins: { lat: number; lng: number }[], destinations: { lat: number; lng: number }[], options: any = {}): Promise<any> {
        try {
            const requestBody: any = {
                origins: origins.map(o => ({ waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lng } } } })),
                destinations: destinations.map(d => ({ waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } } })),
                travelMode: options.travelMode || 'WALK',
                languageCode: 'en',
                units: 'METRIC'
            };

            const response = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': this.apiKey,
                    'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,status'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) throw new Error(`Distance Matrix API error: ${response.statusText}`);
            return await response.json();
        } catch (error) {
            console.error('Distance matrix error:', error);
            return this.getDistanceMatrixLegacy(origins, destinations, options);
        }
    }

    getDistanceMatrixLegacy(origins: { lat: number; lng: number }[], destinations: { lat: number; lng: number }[], options: any = {}): Promise<google.maps.DistanceMatrixResponse> {
        return new Promise((resolve, reject) => {
            const service = new google.maps.DistanceMatrixService();
            service.getDistanceMatrix({
                origins: origins.map(o => new google.maps.LatLng(o.lat, o.lng)),
                destinations: destinations.map(d => new google.maps.LatLng(d.lat, d.lng)),
                travelMode: (options.travelMode === 'WALK' ? google.maps.TravelMode.WALKING : google.maps.TravelMode.DRIVING) as google.maps.TravelMode,
                unitSystem: google.maps.UnitSystem.METRIC
            }, (response, status) => {
                if (status === google.maps.DistanceMatrixStatus.OK && response) {
                    resolve(response);
                } else {
                    reject(new Error(`Distance Matrix failed: ${status}`));
                }
            });
        });
    }

    async optimizeRoute(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, waypoints: { lat: number; lng: number }[], options: any = {}): Promise<any> {
        try {
            const requestBody: any = {
                model: {
                    shipments: waypoints.map((wp, i) => ({
                        id: `shipment_${i}`,
                        pickup: { point: { location: { latLng: { latitude: wp.lat, longitude: wp.lng } } } },
                        delivery: { point: { location: { latLng: { latitude: wp.lat, longitude: wp.lng } } } }
                    })),
                    vehicles: [{
                        id: 'vehicle_1',
                        startLocation: { latLng: { latitude: origin.lat, longitude: origin.lng } },
                        endLocation: { latLng: { latitude: destination.lat, longitude: destination.lng } },
                        travelMode: options.travelMode || 'DRIVE'
                    }]
                }
            };

            const response = await fetch('https://routes.googleapis.com/optimization/v1:optimizeTours', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': this.apiKey
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) throw new Error(`Route Optimization API error: ${response.statusText}`);
            return await response.json();
        } catch (error) {
            console.error('Route optimization error:', error);
            throw error;
        }
    }

    renderRoute(routeData: any, options: { strokeColor?: string; strokeWeight?: number; strokeOpacity?: number } = {}): any {
        const { strokeColor = '#4285f4', strokeWeight = 5, strokeOpacity = 0.8 } = options;
        let polyline: google.maps.Polyline | null = null;

        if (routeData.routes?.[0]?.polyline?.encodedPolyline) {
            // New API format
            const encoded = routeData.routes[0].polyline.encodedPolyline;
            const path = google.maps.geometry?.encoding?.decodePath(encoded);
            if (path) {
                polyline = new google.maps.Polyline({ path, map: this.map, strokeColor, strokeWeight, strokeOpacity });
            }
        } else if (routeData.routes?.[0]?.overview_path) {
            // Legacy format
            polyline = new google.maps.Polyline({ path: routeData.routes[0].overview_path, map: this.map, strokeColor, strokeWeight, strokeOpacity });
        }

        return {
            polyline,
            clear: () => { if (polyline) polyline.setMap(null); }
        };
    }

    async getWalkingTime(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): Promise<any> {
        const matrix = await this.getDistanceMatrix([origin], [destination], { travelMode: 'WALK' });
        if (matrix.elements?.[0]) {
            const el = matrix.elements[0];
            return {
                duration: el.duration?.value || 0,
                distance: el.distance?.value || 0,
                durationText: el.duration?.text || '',
                distanceText: el.distance?.text || ''
            };
        }
        throw new Error('Could not calculate walking time');
    }
}

if (typeof window !== 'undefined') {
    (window as any).RoutesService = RoutesService;
}
