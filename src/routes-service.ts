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

        // Handle transit routes separately
        if (travelMode === 'TRANSIT') {
            return this.getTransitRoute(origin, destination, options);
        }

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

    /**
     * Get Transit Route
     * Gets public transportation routes (bus, subway, train, etc.)
     * Note: Transit routes do not support intermediate waypoints
     */
    async getTransitRoute(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, options: any = {}): Promise<any> {
        const {
            arrivalTime = null,
            departureTime = null,
            transitPreferences = {},
            computeAlternativeRoutes = false,
            language = 'en'
        } = options;

        try {
            const requestBody: any = {
                origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
                destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
                travelMode: 'TRANSIT',
                languageCode: language,
                computeAlternativeRoutes: computeAlternativeRoutes
            };

            // Set arrival or departure time (mutually exclusive)
            if (arrivalTime) {
                requestBody.arrivalTime = typeof arrivalTime === 'string' ? arrivalTime : new Date(arrivalTime).toISOString();
            } else if (departureTime) {
                requestBody.departureTime = typeof departureTime === 'string' ? departureTime : new Date(departureTime).toISOString();
            } else {
                // Default to current time if neither specified
                requestBody.departureTime = new Date().toISOString();
            }

            // Transit preferences
            if (transitPreferences.allowedTravelModes || transitPreferences.routingPreference) {
                requestBody.transitPreferences = {};
                
                if (transitPreferences.allowedTravelModes && Array.isArray(transitPreferences.allowedTravelModes)) {
                    requestBody.transitPreferences.allowedTravelModes = transitPreferences.allowedTravelModes;
                }
                
                if (transitPreferences.routingPreference) {
                    requestBody.transitPreferences.routingPreference = transitPreferences.routingPreference;
                }
            }

            // Field mask includes transit-specific fields
            const fieldMask = [
                'routes.duration',
                'routes.distanceMeters',
                'routes.polyline.encodedPolyline',
                'routes.legs',
                'routes.legs.steps',
                'routes.legs.steps.transitDetails',
                'routes.legs.stepsOverview'
            ].join(',');

            const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': this.apiKey,
                    'X-Goog-FieldMask': fieldMask
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Transit Routes API error: ${response.statusText} - ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Get transit route error:', error);
            return this.getTransitRouteLegacy(origin, destination, options);
        }
    }

    /**
     * Get Transit Route (Legacy API)
     * Fallback to legacy Directions API for transit
     */
    getTransitRouteLegacy(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, options: any = {}): Promise<google.maps.DirectionsResult> {
        return new Promise((resolve, reject) => {
            const directionsService = new google.maps.DirectionsService();
            const request: google.maps.DirectionsRequest = {
                origin: new google.maps.LatLng(origin.lat, origin.lng),
                destination: new google.maps.LatLng(destination.lat, destination.lng),
                travelMode: google.maps.TravelMode.TRANSIT
            };

            if (options.arrivalTime) {
                const arrivalDate = typeof options.arrivalTime === 'string' 
                    ? new Date(options.arrivalTime) 
                    : options.arrivalTime;
                (request as any).arrivalTime = arrivalDate;
            } else if (options.departureTime) {
                const departureDate = typeof options.departureTime === 'string' 
                    ? new Date(options.departureTime) 
                    : options.departureTime;
                (request as any).departureTime = departureDate;
            }

            directionsService.route(request, (result, status) => {
                if (status === google.maps.DirectionsStatus.OK && result) {
                    resolve(result);
                } else {
                    reject(new Error(`Transit directions failed: ${status}`));
                }
            });
        });
    }

    /**
     * Extract transit details from route response
     * Helper method to parse transit-specific information
     */
    extractTransitDetails(routeData: any): any[] {
        const transitSteps: any[] = [];
        
        if (!routeData.routes || routeData.routes.length === 0) {
            return transitSteps;
        }

        routeData.routes.forEach((route: any) => {
            if (route.legs) {
                route.legs.forEach((leg: any) => {
                    if (leg.steps) {
                        leg.steps.forEach((step: any) => {
                            if (step.transitDetails) {
                                transitSteps.push({
                                    departureStop: step.transitDetails.stopDetails?.departureStop,
                                    arrivalStop: step.transitDetails.stopDetails?.arrivalStop,
                                    departureTime: step.transitDetails.stopDetails?.departureTime,
                                    arrivalTime: step.transitDetails.stopDetails?.arrivalTime,
                                    localizedDepartureTime: step.transitDetails.localizedValues?.departureTime,
                                    localizedArrivalTime: step.transitDetails.localizedValues?.arrivalTime,
                                    headsign: step.transitDetails.headsign,
                                    transitLine: step.transitDetails.transitLine,
                                    stopCount: step.transitDetails.stopCount
                                });
                            }
                        });
                    }
                });
            }
        });

        return transitSteps;
    }

    /**
     * Get next transit departure time
     * Finds the next available transit option for a route
     */
    async getNextTransitDeparture(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, options: any = {}): Promise<any> {
        const result = await this.getTransitRoute(origin, destination, {
            ...options,
            departureTime: new Date().toISOString(),
            computeAlternativeRoutes: true
        });

        const transitDetails = this.extractTransitDetails(result);
        if (transitDetails.length > 0) {
            const firstTransit = transitDetails[0];
            return {
                departureTime: firstTransit.localizedDepartureTime || firstTransit.departureTime,
                arrivalTime: firstTransit.localizedArrivalTime || firstTransit.arrivalTime,
                transitLine: firstTransit.transitLine,
                departureStop: firstTransit.departureStop,
                arrivalStop: firstTransit.arrivalStop,
                route: result
            };
        }

        throw new Error('No transit options found');
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
        // Handle transit mode separately
        if (options.travelMode === 'TRANSIT') {
            return this.getTransitDistanceMatrix(origins, destinations, options);
        }

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

    /**
     * Get Transit Distance Matrix
     * Calculate transit times/distances between multiple origins and destinations
     */
    async getTransitDistanceMatrix(origins: { lat: number; lng: number }[], destinations: { lat: number; lng: number }[], options: any = {}): Promise<any> {
        const {
            arrivalTime = null,
            departureTime = null,
            transitPreferences = {},
            language = 'en'
        } = options;

        try {
            const requestBody: any = {
                origins: origins.map(o => ({ waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lng } } } })),
                destinations: destinations.map(d => ({ waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } } })),
                travelMode: 'TRANSIT',
                languageCode: language
            };

            if (arrivalTime) {
                requestBody.arrivalTime = typeof arrivalTime === 'string' ? arrivalTime : new Date(arrivalTime).toISOString();
            } else if (departureTime) {
                requestBody.departureTime = typeof departureTime === 'string' ? departureTime : new Date(departureTime).toISOString();
            } else {
                requestBody.departureTime = new Date().toISOString();
            }

            if (transitPreferences.allowedTravelModes || transitPreferences.routingPreference) {
                requestBody.transitPreferences = {};
                if (transitPreferences.allowedTravelModes) {
                    requestBody.transitPreferences.allowedTravelModes = transitPreferences.allowedTravelModes;
                }
                if (transitPreferences.routingPreference) {
                    requestBody.transitPreferences.routingPreference = transitPreferences.routingPreference;
                }
            }

            const response = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': this.apiKey,
                    'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,status'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) throw new Error(`Transit Distance Matrix API error: ${response.statusText}`);
            return await response.json();
        } catch (error) {
            console.error('Transit distance matrix error:', error);
            throw error;
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
