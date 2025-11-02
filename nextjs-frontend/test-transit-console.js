/**
 * Transit Route Test for Next.js
 * Copy and paste this into browser console on localhost:3000
 */

// Wait for Google Maps to load, then run tests
(async function() {
    console.log('🧪 Transit Route Test for Next.js\n');
    
    // Test coordinates (San Francisco area - good transit coverage)
    const testOrigin = { lat: 37.7749, lng: -122.4194 }; // Union Square, SF
    const testDestination = { lat: 37.7849, lng: -122.4094 }; // Nearby location ~1km away
    
    // Check if Google Maps is loaded
    if (typeof google === 'undefined' || !google.maps) {
        console.error('❌ Google Maps not loaded. Please wait for the map to load first.');
        return;
    }
    
    // Create a temporary map instance for RoutesService
    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);
    
    const tempMap = new google.maps.Map(tempDiv, {
        center: testOrigin,
        zoom: 13
    });
    
    // Get API key from env or extract from Google Maps script
    let apiKey = '';
    // Try to get from window/process (Next.js)
    if (typeof process !== 'undefined' && process.env) {
        apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    }
    // If not found, extract from Google Maps script tag
    if (!apiKey) {
        const scripts = document.querySelectorAll('script[src*="maps.googleapis.com"]');
        if (scripts.length > 0) {
            const src = scripts[0].src;
            const match = src.match(/[?&]key=([^&]+)/);
            if (match) {
                apiKey = match[1];
            }
        }
    }
    
    if (!apiKey) {
        console.error('❌ Could not find Google Maps API key. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local');
        return;
    }
    
    console.log('✅ API Key found:', apiKey.substring(0, 10) + '...');
    
    // Create RoutesService class (simplified inline version)
    class RoutesService {
        constructor(map, apiKey) {
            this.map = map;
            this.apiKey = apiKey;
        }
        
        async getTransitRoute(origin, destination, options = {}) {
            const {
                arrivalTime = null,
                departureTime = null,
                transitPreferences = {},
                computeAlternativeRoutes = false,
                language = 'en'
            } = options;

            const requestBody = {
                origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
                destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
                travelMode: 'TRANSIT',
                languageCode: language,
                computeAlternativeRoutes: computeAlternativeRoutes
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
                if (transitPreferences.allowedTravelModes && Array.isArray(transitPreferences.allowedTravelModes)) {
                    requestBody.transitPreferences.allowedTravelModes = transitPreferences.allowedTravelModes;
                }
                if (transitPreferences.routingPreference) {
                    requestBody.transitPreferences.routingPreference = transitPreferences.routingPreference;
                }
            }

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
        }
        
        extractTransitDetails(routeData) {
            const transitSteps = [];
            
            if (!routeData.routes || routeData.routes.length === 0) {
                return transitSteps;
            }

            routeData.routes.forEach((route) => {
                if (route.legs) {
                    route.legs.forEach((leg) => {
                        if (leg.steps) {
                            leg.steps.forEach((step) => {
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
        
        async getNextTransitDeparture(origin, destination, options = {}) {
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
    }
    
    // Create routes service instance
    const routesService = new RoutesService(tempMap, apiKey);
    
    // Test functions
    window.testTransitRoute = async function() {
        console.log('🚌 Testing Transit Route...');
        console.log('Origin:', testOrigin);
        console.log('Destination:', testDestination);

        try {
            const route = await routesService.getTransitRoute(
                testOrigin,
                testDestination,
                {
                    departureTime: new Date().toISOString(),
                    transitPreferences: {
                        allowedTravelModes: ['BUS', 'SUBWAY'],
                        routingPreference: 'LESS_WALKING'
                    },
                    computeAlternativeRoutes: true
                }
            );

            console.log('✅ Transit route retrieved:', route);
            console.log('Routes found:', route.routes?.length || 0);

            const transitSteps = routesService.extractTransitDetails(route);
            console.log('✅ Transit steps extracted:', transitSteps.length);

            transitSteps.forEach((step, index) => {
                console.log(`\n📍 Transit Step ${index + 1}:`);
                console.log(`  Departure Stop: ${step.departureStop?.name || 'N/A'}`);
                console.log(`  Arrival Stop: ${step.arrivalStop?.name || 'N/A'}`);
                console.log(`  Departure Time: ${step.localizedDepartureTime?.time?.text || step.departureTime || 'N/A'}`);
                console.log(`  Arrival Time: ${step.localizedArrivalTime?.time?.text || step.arrivalTime || 'N/A'}`);
                console.log(`  Transit Line: ${step.transitLine?.name || 'N/A'}`);
                console.log(`  Vehicle Type: ${step.transitLine?.vehicle?.type || 'N/A'}`);
                console.log(`  Headsign: ${step.headsign || 'N/A'}`);
                console.log(`  Stop Count: ${step.stopCount || 'N/A'}`);
            });

            return { route, transitSteps };
        } catch (error) {
            console.error('❌ Transit route test failed:', error);
            throw error;
        }
    };
    
    window.testNextTransitDeparture = async function() {
        console.log('\n🚌 Testing Next Transit Departure...');

        try {
            const nextDeparture = await routesService.getNextTransitDeparture(
                testOrigin,
                testDestination,
                {
                    transitPreferences: {
                        allowedTravelModes: ['BUS']
                    }
                }
            );

            console.log('✅ Next transit departure:', nextDeparture);
            
            // Format times properly
            const departureTime = nextDeparture.departureTime?.time?.text || 
                                 (typeof nextDeparture.departureTime === 'string' ? nextDeparture.departureTime : 'N/A');
            const arrivalTime = nextDeparture.arrivalTime?.time?.text || 
                               (typeof nextDeparture.arrivalTime === 'string' ? nextDeparture.arrivalTime : 'N/A');
            
            console.log(`  Departure Time: ${departureTime}`);
            console.log(`  Arrival Time: ${arrivalTime}`);
            console.log(`  Transit Line: ${nextDeparture.transitLine?.name || 'N/A'}`);
            console.log(`  Departure Stop: ${nextDeparture.departureStop?.name || 'N/A'}`);
            console.log(`  Arrival Stop: ${nextDeparture.arrivalStop?.name || 'N/A'}`);

            return nextDeparture;
        } catch (error) {
            console.error('❌ Next transit departure test failed:', error);
            throw error;
        }
    };
    
    window.runAllTransitTests = async function() {
        console.log('🧪 Running All Transit Route Tests...\n');
        
        try {
            await window.testTransitRoute();
            await window.testNextTransitDeparture();
            console.log('\n✅ All transit tests completed successfully!');
        } catch (error) {
            console.error('\n❌ Some tests failed:', error);
        }
    };
    
    console.log('✅ Test functions loaded! Run:');
    console.log('  - runAllTransitTests()  // Run all tests');
    console.log('  - testTransitRoute()    // Test basic transit route');
    console.log('  - testNextTransitDeparture()  // Test next departure');
    console.log('\n⚠️ Note: Make sure NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set in .env.local');
    
    // Cleanup temp div
    setTimeout(() => document.body.removeChild(tempDiv), 1000);
})();

