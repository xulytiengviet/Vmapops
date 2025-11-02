/**
 * Trip Planning Tool
 * Creates an optimized multi-stop itinerary with AI suggestions
 * Orchestrates place searches, route optimization, and timeline generation
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { PlacesService } from "@/lib/services/places-service";
import { RoutesService } from "@/lib/services/routes-service";
import { GeocodingService } from "@/lib/services/geocoding-service";
import TimeZoneService from "@/lib/services/timezone-service";
import {
  calculateDistance,
} from "./utils/distance-calculator";
import type { CityAnalystRuntimeContext } from "../agents/cityAnalystAgent";

const tripPlanSchema = z.object({
  startLocation: z
    .union([
      z.object({
        lat: z.number(),
        lng: z.number(),
      }),
      z.string(),
    ])
    .optional()
    .describe("Starting location. Can be coordinates object, saved place name like 'home' or 'work', or omitted to use user's current location"),

  categories: z
    .array(
      z.object({
        category: z.string().describe("Place category (e.g., 'brunch', 'museums', 'dinner')"),
        query: z.string().optional().describe("Specific search query for this category"),
        minRating: z.number().min(0).max(5).optional().describe("Minimum rating"),
        count: z.number().int().min(1).max(5).optional().default(1).describe("Number of places to find for this category"),
      })
    )
    .min(1)
    .describe("Array of categories/stops for the trip"),

  travelMode: z
    .enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"])
    .optional()
    .default("WALK")
    .describe("Default travel mode between stops (used if legModes not specified)"),

  legModes: z
    .array(z.enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"]))
    .optional()
    .describe("Travel mode for each leg (one per leg). Example: [\"WALK\", \"TRANSIT\"] means walk to first stop, then take transit to second stop. Length should be categories.length - 1 (one mode per leg between stops)"),

  timeWindow: z
    .object({
      startTime: z.string().optional().describe("ISO 8601 start time"),
      endTime: z.string().optional().describe("ISO 8601 end time"),
      durationMinutes: z.number().optional().describe("Total trip duration in minutes"),
    })
    .optional()
    .describe("Time constraints for the trip"),

  radius: z
    .number()
    .optional()
    .default(5000)
    .describe("Search radius in meters (default: 5000m)"),

  optimizeOrder: z
    .boolean()
    .optional()
    .default(true)
    .describe("Optimize waypoint order to minimize travel time"),
});

const tripStopSchema = z.object({
  stopNumber: z.number(),
  category: z.string(),
  placeId: z.string(),
  name: z.string(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  address: z.string(),
  rating: z.number().optional(),
  ratingCount: z.number().optional(),
  estimatedArrival: z.string().optional(),
  estimatedDeparture: z.string().optional(),
  visitDurationMinutes: z.number().optional(),
  distanceFromPrevious: z.number().optional(),
  travelTimeFromPrevious: z.number().optional(),
  travelMode: z.enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"]).optional().describe("Travel mode used to reach this stop"),
});

const tripPlanOutputSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      tripId: z.string(),
      stops: z.array(tripStopSchema),
      totalDistance: z.number(),
      totalDuration: z.number(),
      estimatedEndTime: z.string().optional(),
          mapCommands: z.array(
            z.object({
              type: z.enum(["CLEAR_MARKERS", "CLEAR_ROUTES", "SHOW_ON_MAP", "DRAW_ROUTE", "FIT_BOUNDS", "PAN_TO", "SET_TRIP_STOPS"]),
              payload: z.any().optional(),
            })
          ),
    })
    .optional(),
  error: z.string().optional(),
});

export const tripPlan = createTool({
  id: "trip-plan",
  description: `
    Create an optimized multi-stop trip itinerary with AI suggestions.
    
    Intelligently searches for places in each category, optimizes the route order,
    calculates travel times between stops, and creates a visual timeline.
    
    **MULTI-MODAL SUPPORT**: Use legModes parameter to specify different travel modes for each leg!
    Example: legModes: ["WALK", "TRANSIT"] means walk to first stop, then take transit to second stop.
    
    Examples:
    - "Plan my Saturday" → categories: [{category: "brunch"}, {category: "activities"}, {category: "dinner"}]
    - "Weekend trip to Napa" → categories: [{category: "wineries"}, {category: "restaurants"}, {category: "hotels"}]
    - "3 stops: coffee → museum → lunch" → categories: [{category: "coffee"}, {category: "museum"}, {category: "lunch"}]
    - "Walk to coffee then train to museum" → categories: [{category: "coffee"}, {category: "museum"}], legModes: ["WALK", "TRANSIT"]
    - "Plan trip from my home to coffee shop" → startLocation: "home", categories: [{category: "coffee"}]
    - "Plan trip from work to museum then restaurant" → startLocation: "work", categories: [{category: "museum"}, {category: "restaurant"}]
    
    **IMPORTANT**: When user says "from my home" or "from home", set startLocation: "home" (not a category).
    When user says "from work", set startLocation: "work" (not a category).
    Categories should only include actual stops/places to visit, not the starting point.
    
    Returns: Complete itinerary with numbered stops, optimized route(s), and timeline
    Automatically displays on map with numbered markers and route visualization.
    For multi-modal trips, each leg is shown in a different color (green=walk, blue=transit, red=drive, orange=bike).
  `,
  inputSchema: tripPlanSchema,
  outputSchema: tripPlanOutputSchema,

  execute: async ({ context, runtimeContext }) => {
    try {
      const placesService = new PlacesService();
      const routesService = new RoutesService();

      // Get start location from context or runtime
      const userLocation = runtimeContext?.get("userLocation") as CityAnalystRuntimeContext["userLocation"];
      const savedPlaces = runtimeContext?.get("savedPlaces") as Record<string, { location: { lat: number; lng: number }; name: string; address: string }> | undefined;
      const geocodingService = new GeocodingService();

      // Resolve start location (can be coordinates, saved place name like "home", or undefined)
      let actualStartLocation: { lat: number; lng: number } | null = null;
      
      if (context.startLocation) {
        if (typeof context.startLocation === 'object' && 'lat' in context.startLocation && 'lng' in context.startLocation) {
          // Already coordinates
          actualStartLocation = context.startLocation;
        } else if (typeof context.startLocation === 'string') {
          // String like "home" or "work" - check saved places first
          const normalizedName = context.startLocation.toLowerCase().trim();
          if (savedPlaces) {
            if (normalizedName === 'home' && savedPlaces.home) {
              actualStartLocation = savedPlaces.home.location;
              console.log(`[trip-plan] Resolved startLocation "home" to saved home: ${savedPlaces.home.name}`);
            } else if (normalizedName === 'work' && savedPlaces.work) {
              actualStartLocation = savedPlaces.work.location;
              console.log(`[trip-plan] Resolved startLocation "work" to saved work: ${savedPlaces.work.name}`);
            } else if (savedPlaces[normalizedName]) {
              actualStartLocation = savedPlaces[normalizedName].location;
              console.log(`[trip-plan] Resolved startLocation "${context.startLocation}" to saved favorite: ${savedPlaces[normalizedName].name}`);
            }
          }
          
          // If not found in saved places, try geocoding
          if (!actualStartLocation) {
            const geocodeResults = await geocodingService.geocode(context.startLocation);
            if (geocodeResults && geocodeResults.length > 0) {
              actualStartLocation = geocodeResults[0].location;
              console.log(`[trip-plan] Resolved startLocation "${context.startLocation}" via geocoding`);
            }
          }
        }
      }
      
      // Fallback to user location
      if (!actualStartLocation) {
        actualStartLocation = userLocation || null;
      }

      if (!actualStartLocation) {
        return {
          success: false,
          error: "Start location is required. Provide startLocation parameter or ensure user location is available.",
        };
      }

      console.log("[trip-plan] Planning trip with categories:", context.categories.map(c => c.category).join(", "));
      console.log(`[trip-plan] Start location: [${actualStartLocation.lat}, ${actualStartLocation.lng}]`);

      // Process all categories as stops (no special handling needed)
      const categoriesToProcess = context.categories;

      // Step 1: Search for places in each category
      const categoryPlaces: Array<{
        category: string;
        places: any[];
      }> = [];

      for (const categoryConfig of categoriesToProcess) {
        const query = categoryConfig.query || categoryConfig.category;
        const count = categoryConfig.count || 1;
        const categoryName = categoryConfig.category.toLowerCase().trim();

        // Check if this category matches a saved place (home, work, or favorite)
        const savedPlace = savedPlaces?.[categoryName] || 
          (categoryName === 'home' && savedPlaces?.home) ||
          (categoryName === 'work' && savedPlaces?.work);

        if (savedPlace) {
          console.log(`[trip-plan] Using saved place for "${categoryConfig.category}": ${savedPlace.name}`);
          // Create a place object from saved place
          const savedPlaceObj = {
            placeId: `saved-${categoryName}`,
            name: savedPlace.name,
            address: savedPlace.address,
            location: savedPlace.location,
            rating: undefined,
            userRatingsTotal: 0,
            priceLevel: undefined,
            openNow: undefined,
            types: [categoryName],
            distanceMeters: calculateDistance(actualStartLocation, savedPlace.location),
          };

          categoryPlaces.push({
            category: categoryConfig.category,
            places: [savedPlaceObj],
          });
          console.log(`[trip-plan] Added saved place: ${savedPlace.name}`);
          continue;
        }

        console.log(`[trip-plan] Searching for ${count} ${categoryConfig.category}...`);

        try {
          const results = await placesService.textSearch(query, {
            location: actualStartLocation,
            radius: context.radius || 5000,
            maxResults: Math.max(count * 3, 10), // Get more candidates to choose from
            minRating: categoryConfig.minRating,
            openNow: true, // Prefer places that are open
          });

          // Sort by rating and distance, take top N
          const enriched = results
            .map((place) => ({
              ...place,
              distanceMeters: calculateDistance(actualStartLocation, place.location),
            }))
            .sort((a, b) => {
              // Prioritize rating, then distance
              const ratingDiff = (b.rating || 0) - (a.rating || 0);
              if (Math.abs(ratingDiff) > 0.5) return ratingDiff;
              return a.distanceMeters - b.distanceMeters;
            })
            .slice(0, count);

          categoryPlaces.push({
            category: categoryConfig.category,
            places: enriched,
          });

          console.log(`[trip-plan] Found ${enriched.length} ${categoryConfig.category} options`);
        } catch (error) {
          console.error(`[trip-plan] Error searching ${categoryConfig.category}:`, error);
          categoryPlaces.push({
            category: categoryConfig.category,
            places: [],
          });
        }
      }

      // Step 2: Select best place from each category (simple heuristic: highest rated, closest)
      const selectedStops: Array<{
        category: string;
        place: any;
        index: number;
      }> = [];

      for (const catPlaces of categoryPlaces) {
        if (catPlaces.places.length > 0) {
          selectedStops.push({
            category: catPlaces.category,
            place: catPlaces.places[0], // Take best option
            index: selectedStops.length,
          });
        }
      }

      if (selectedStops.length === 0) {
        return {
          success: false,
          error: "Could not find places for any of the requested categories.",
        };
      }

      // Step 3: Determine travel modes for each leg
      const defaultMode = context.travelMode || "WALK";
      const numLegs = selectedStops.length; // Number of legs = number of stops (one leg per stop)
      // Use provided legModes or create defaults
      // Note: legModes should match the number of legs after processing (home/work removed if it was first)
      const legModes = context.legModes || Array(numLegs).fill(defaultMode);
      
      // Normalize leg modes array (one mode per leg)
      const normalizedLegModes: Array<"DRIVE" | "WALK" | "BICYCLE" | "TRANSIT"> = [];
      for (let i = 0; i < numLegs; i++) {
        normalizedLegModes[i] = (legModes[i] || defaultMode) as "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";
      }

      console.log(`[trip-plan] Travel modes for ${numLegs} legs:`, normalizedLegModes);

      // Step 4: Calculate routes for each leg (support multi-modal journeys)
      const allLegs: any[] = [];
      const allPolylines: string[] = [];
      const allRoutes: any[] = []; // Store full route objects to access transit info
      let totalDistance = 0;
      let totalDuration = 0;

      // Check if all legs use the same mode (can use single route with waypoints)
      const allSameMode = normalizedLegModes.every(mode => mode === normalizedLegModes[0]);
      
      if (allSameMode && context.optimizeOrder !== false) {
        // Single route with waypoints (more efficient)
        const origin = actualStartLocation;
        const destination = selectedStops[selectedStops.length - 1].place.location;
        const intermediateWaypoints = selectedStops.slice(0, -1).map((stop) => stop.place.location);

        console.log(`[trip-plan] Single route with ${intermediateWaypoints.length} waypoints (mode: ${normalizedLegModes[0]})...`);

        const routes = await routesService.getDirections({
          origin,
          destination,
          waypoints: intermediateWaypoints.length > 0 ? intermediateWaypoints : undefined,
          travelMode: normalizedLegModes[0],
          optimizeWaypoints: context.optimizeOrder === true,
          alternatives: false,
        });

        if (!routes || routes.length === 0) {
          return {
            success: false,
            error: "Could not calculate route between stops.",
          };
        }

        const primaryRoute = routes[0];
        allLegs.push(...primaryRoute.legs);
        allPolylines.push(primaryRoute.polyline);
        allRoutes.push(primaryRoute); // Store full route
        totalDistance = primaryRoute.distanceMeters;
        totalDuration = primaryRoute.durationSeconds;
      } else {
        // Multi-modal: calculate each leg separately
        console.log(`[trip-plan] Multi-modal route: calculating ${numLegs} legs separately...`);
        
        let currentOrigin = actualStartLocation;
        
        for (let i = 0; i < numLegs; i++) {
          const legMode = normalizedLegModes[i];
          const legDestination = selectedStops[i].place.location;
          
          console.log(`[trip-plan] Leg ${i + 1}: ${legMode} from [${currentOrigin.lat}, ${currentOrigin.lng}] to [${legDestination.lat}, ${legDestination.lng}]`);

          const legRoutes = await routesService.getDirections({
            origin: currentOrigin,
            destination: legDestination,
            travelMode: legMode,
            alternatives: false,
          });

          if (!legRoutes || legRoutes.length === 0) {
            console.warn(`[trip-plan] Could not calculate leg ${i + 1} with mode ${legMode}`);
            // Create a placeholder leg
            allLegs.push({
              startAddress: "",
              endAddress: "",
              distanceMeters: calculateDistance(currentOrigin, legDestination),
              durationSeconds: 0,
              steps: [],
            });
            allPolylines.push("");
            allRoutes.push(null); // Placeholder for missing route
          } else {
            const legRoute = legRoutes[0];
            allLegs.push(...legRoute.legs);
            allPolylines.push(legRoute.polyline);
            allRoutes.push(legRoute); // Store full route with transit info
            totalDistance += legRoute.distanceMeters;
            totalDuration += legRoute.durationSeconds;
          }

          // Next leg starts from current stop
          currentOrigin = legDestination;
        }
      }

      // Create a combined route object for compatibility
      const primaryRoute = {
        legs: allLegs,
        polyline: allPolylines.join(""), // Combine polylines (may need better merging)
        distanceMeters: totalDistance,
        durationSeconds: totalDuration,
      };

      // Step 5: Build trip stops with timing information
      const tripStops: Array<{
        stopNumber: number;
        category: string;
        placeId: string;
        name: string;
        location: { lat: number; lng: number };
        address: string;
        rating?: number;
        ratingCount?: number;
        estimatedArrival?: string; // UTC ISO string
        estimatedDeparture?: string; // UTC ISO string
        localArrivalTime?: string; // Local time string for display
        localDepartureTime?: string; // Local time string for display
        timeZoneId?: string; // IANA timezone ID (e.g., "America/Los_Angeles")
        visitDurationMinutes?: number;
        distanceFromPrevious?: number;
        travelTimeFromPrevious?: number;
        travelMode?: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";
      }> = [];

      // Initialize TimeZoneService for local time calculations
      const timeZoneService = new TimeZoneService();

      // Get mapCenter for timezone reference (viewport location)
      const mapCenter = runtimeContext?.get("mapCenter") as CityAnalystRuntimeContext["mapCenter"];
      
      // Determine timezone reference location: use mapCenter (viewport) > userLocation > actualStartLocation
      // This ensures "2 PM" means 2 PM in the timezone where the user is viewing the map
      const timezoneReferenceLocation = mapCenter || userLocation || actualStartLocation;
      
      // Handle start time: if provided, interpret it as LOCAL time in the viewport's timezone
      let currentTime: Date;
      if (context.timeWindow?.startTime) {
        const startTimeStr = context.timeWindow.startTime;
        
        // Check if the string has explicit timezone info
        const hasTimezone = startTimeStr.includes('Z') || 
                            startTimeStr.match(/[+-]\d{2}:\d{2}$/) ||
                            startTimeStr.match(/[+-]\d{4}$/);
        
        if (!hasTimezone && timezoneReferenceLocation) {
          // No timezone info - treat as LOCAL time in viewport's timezone
          try {
            // Parse the date components from the ISO string
            const dateMatch = startTimeStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?/);
            if (!dateMatch) {
              throw new Error('Invalid date format');
            }
            
            const [, year, month, day, hour, minute, second, millisecond] = dateMatch;
            // Create a test date to get timezone info
            const testDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
            const viewportTimeZone = await timeZoneService.getTimeZone(timezoneReferenceLocation, testDate);
            
            // Convert local time to UTC by adjusting for timezone offset
            // utcOffset is in seconds, positive means ahead of UTC
            const utcOffsetHours = viewportTimeZone.utcOffset / 3600;
            const localDate = new Date(Date.UTC(
              parseInt(year),
              parseInt(month) - 1,
              parseInt(day),
              parseInt(hour),
              parseInt(minute),
              parseInt(second || '0'),
              parseInt(millisecond || '0')
            ));
            
            // Adjust for timezone: subtract offset to get UTC equivalent
            currentTime = new Date(localDate.getTime() - viewportTimeZone.utcOffset * 1000);
            console.log(`[trip-plan] Parsed start time "${startTimeStr}" as ${hour}:${minute} local time in viewport timezone ${viewportTimeZone.timeZoneId} (UTC${utcOffsetHours >= 0 ? '+' : ''}${utcOffsetHours}), converted to UTC: ${currentTime.toISOString()}`);
          } catch (error) {
            console.warn(`[trip-plan] Failed to parse start time with viewport timezone, using as-is:`, error);
            currentTime = new Date(startTimeStr);
          }
        } else {
          // Has timezone info, parse as-is
          currentTime = new Date(startTimeStr);
        }
      } else {
        currentTime = new Date();
      }

      // Calculate timing for each stop based on route legs
      for (let i = 0; i < selectedStops.length; i++) {
        const stop = selectedStops[i];
        const leg = primaryRoute.legs[i] || primaryRoute.legs[primaryRoute.legs.length - 1];
        const legMode = normalizedLegModes[i] || defaultMode;

        // Calculate travel time from previous stop (or start)
        const travelTimeSeconds = leg?.durationSeconds || 0;
        const travelTimeMinutes = Math.round(travelTimeSeconds / 60);
        const distanceFromPrevious = leg?.distanceMeters || 0;

        // Arrival time (add travel time) - stored as UTC Date
        currentTime = new Date(currentTime.getTime() + travelTimeSeconds * 1000);
        
        // Get timezone for this stop location (handles DST based on timestamp)
        let timeZoneInfo;
        try {
          timeZoneInfo = await timeZoneService.getTimeZone(stop.place.location, currentTime);
        } catch (error) {
          console.warn(`[trip-plan] Failed to get timezone for stop ${i + 1} (${stop.place.name}):`, error);
          // Fallback: use UTC if timezone lookup fails
          timeZoneInfo = {
            timeZoneId: 'UTC',
            utcOffset: 0,
            currentTime: currentTime,
          };
        }

        // Convert UTC time to local time string for this location
        const localArrivalTime = currentTime.toLocaleString('en-US', {
          timeZone: timeZoneInfo.timeZoneId,
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });

        // Visit duration (default 60 minutes, adjust based on category)
        const visitDurationMinutes = getVisitDuration(stop.category);

        // Departure time (add visit duration) - stored as UTC Date
        const departureTime = new Date(currentTime.getTime() + visitDurationMinutes * 60 * 1000);
        
        // Get timezone for departure (might be different if DST changes during visit)
        let departureTimeZoneInfo;
        try {
          departureTimeZoneInfo = await timeZoneService.getTimeZone(stop.place.location, departureTime);
        } catch (error) {
          console.warn(`[trip-plan] Failed to get timezone for departure at stop ${i + 1}:`, error);
          departureTimeZoneInfo = timeZoneInfo; // Use same timezone as arrival
        }

        // Convert UTC departure time to local time string
        const localDepartureTime = departureTime.toLocaleString('en-US', {
          timeZone: departureTimeZoneInfo.timeZoneId,
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });

        // Store UTC ISO string (for calculations) and local time strings (for display)
        const estimatedArrival = currentTime.toISOString();
        const estimatedDeparture = departureTime.toISOString();

        tripStops.push({
          stopNumber: i + 1,
          category: stop.category,
          placeId: stop.place.placeId,
          name: stop.place.name,
          location: stop.place.location,
          address: stop.place.address || stop.place.formattedAddress || "",
          rating: stop.place.rating,
          ratingCount: stop.place.userRatingsTotal || stop.place.reviewCount,
          estimatedArrival, // UTC ISO string
          estimatedDeparture, // UTC ISO string
          // Local time strings for display (computed using stop's timezone)
          localArrivalTime, // Local time string for arrival
          localDepartureTime, // Local time string for departure
          timeZoneId: timeZoneInfo.timeZoneId, // IANA timezone ID (e.g., "America/Los_Angeles")
          visitDurationMinutes,
          distanceFromPrevious,
          travelTimeFromPrevious: travelTimeMinutes,
          travelMode: legMode, // Add travel mode used to reach this stop
        });

        // Update current time for next stop
        currentTime = departureTime;
      }

      // Step 6: Build map commands
      const mapCommands: Array<{
        type: "CLEAR_MARKERS" | "CLEAR_ROUTES" | "SHOW_ON_MAP" | "DRAW_ROUTE" | "FIT_BOUNDS" | "PAN_TO" | "SET_TRIP_STOPS";
        payload?: any;
      }> = [];

      // Clear old markers and routes
      mapCommands.push({ type: "CLEAR_MARKERS", payload: {} });
      mapCommands.push({ type: "CLEAR_ROUTES", payload: {} });

      // Add numbered markers for each stop
      const markers = tripStops.map((stop) => ({
        id: `trip-stop-${stop.stopNumber}`,
        position: stop.location,
        title: `${stop.stopNumber}. ${stop.name}`,
        type: "place" as const,
        metadata: {
          ...stop,
          isTripStop: true,
          stopNumber: stop.stopNumber,
        },
      }));

      mapCommands.push({
        type: "SHOW_ON_MAP",
        payload: { markers },
      });

      // Draw route(s) - for multi-modal, draw each leg separately with different colors
      if (allSameMode) {
        // Single route with one color
        if (primaryRoute.polyline) {
          const routeObj = allRoutes[0]; // Get the full route object
          mapCommands.push({
            type: "DRAW_ROUTE",
            payload: {
              polyline: primaryRoute.polyline,
              color: "#4285F4",
              weight: 4,
              opacity: 0.9,
              metadata: {
                isTrip: true,
                tripId: `trip-${Date.now()}`,
                travelMode: normalizedLegModes[0],
                // Include transit info if available
                transitSteps: routeObj?.transitSteps,
                transitFare: routeObj?.transitFare,
              },
            },
          });
        }
      } else {
        // Multi-modal: draw each leg with mode-specific colors
        const modeColors: Record<string, string> = {
          WALK: "#22C55E",      // Green for walking
          TRANSIT: "#3B82F6",   // Blue for transit
          DRIVE: "#EF4444",     // Red for driving
          BICYCLE: "#F59E0B",   // Orange for biking
        };

        for (let i = 0; i < allPolylines.length; i++) {
          const polyline = allPolylines[i];
          const legMode = normalizedLegModes[i];
          const legRouteObj = allRoutes[i]; // Get full route object for this leg
          if (polyline) {
            mapCommands.push({
              type: "DRAW_ROUTE",
              payload: {
                polyline: polyline,
                color: modeColors[legMode] || "#4285F4",
                weight: 4,
                opacity: 0.9,
                metadata: {
                  isTrip: true,
                  tripId: `trip-${Date.now()}`,
                  legIndex: i,
                  travelMode: legMode,
                  // Include transit info from the route object
                  transitSteps: legRouteObj?.transitSteps,
                  transitFare: legRouteObj?.transitFare,
                },
              },
            });
          }
        }
      }

      // Fit bounds to show all stops
      const waypoints = selectedStops.map((stop) => stop.place.location);
      const allLocations = [actualStartLocation!, ...waypoints];
      const bounds = {
        north: Math.max(...allLocations.map((loc) => loc.lat)),
        south: Math.min(...allLocations.map((loc) => loc.lat)),
        east: Math.max(...allLocations.map((loc) => loc.lng)),
        west: Math.min(...allLocations.map((loc) => loc.lng)),
      };

      mapCommands.push({
        type: "FIT_BOUNDS",
        payload: bounds,
      });

      // Set trip stops in state
      mapCommands.push({
        type: "SET_TRIP_STOPS",
        payload: tripStops,
      });

      const tripId = `trip-${Date.now()}`;

      return {
        success: true,
        data: {
          tripId,
          stops: tripStops,
          totalDistance: primaryRoute.distanceMeters,
          totalDuration: primaryRoute.durationSeconds,
          estimatedEndTime: tripStops[tripStops.length - 1]?.estimatedDeparture,
          mapCommands,
        },
      };
    } catch (error) {
      console.error("trip-plan tool error:", error);
      return {
        success: false,
        error: `Trip planning failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Estimate visit duration based on category
 */
function getVisitDuration(category: string): number {
  const catLower = category.toLowerCase();
  
  if (catLower.includes("coffee") || catLower.includes("cafe")) return 30;
  if (catLower.includes("meal") || catLower.includes("lunch") || catLower.includes("dinner") || catLower.includes("brunch")) return 90;
  if (catLower.includes("museum") || catLower.includes("gallery")) return 120;
  if (catLower.includes("park")) return 60;
  if (catLower.includes("activity") || catLower.includes("tour")) return 120;
  if (catLower.includes("shop") || catLower.includes("store")) return 45;
  if (catLower.includes("wine") || catLower.includes("winery")) return 90;
  
  return 60; // Default 1 hour
}

