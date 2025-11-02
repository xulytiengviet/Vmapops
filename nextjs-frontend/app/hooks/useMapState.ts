'use client';

/**
 * Map State Manager
 * Uses Zustand to manage map state (markers, routes, viewport)
 * Consumed by MapView component
 */

import { create } from 'zustand';

export interface MapMarker {
  id: string;
  position: { lat: number; lng: number };
  title: string;
  type: 'place' | 'location' | 'route-start' | 'route-end';
  metadata?: any;
}

export interface MapRoute {
  id: string;
  polyline: string;
  color: string;
  weight?: number;
  opacity?: number;
  metadata?: any;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapHighlight {
  id: string;
  type: 'rectangle';
  bounds: MapBounds;
  color?: string;
}

export type ArtifactType = 'routes' | 'places' | 'trip';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  timestamp: Date;
  data: any;
}

export interface MapState {
  // Viewport
  center: { lat: number; lng: number };
  zoom: number;
  bounds?: MapBounds;

  // Elements
  markers: MapMarker[];
  routes: MapRoute[];
  highlights: MapHighlight[];
  selectedRouteId?: string; // Currently selected/highlighted route
  selectedPlaceId?: string; // Currently selected/highlighted place
  tripStops?: Array<{
    stopNumber: number;
    category: string;
    placeId: string;
    name: string;
    location: { lat: number; lng: number };
    address: string;
    rating?: number;
    estimatedArrival?: string; // UTC ISO string
    estimatedDeparture?: string; // UTC ISO string
    localArrivalTime?: string; // Local time string for display
    localDepartureTime?: string; // Local time string for display
    timeZoneId?: string; // IANA timezone ID (e.g., "America/Los_Angeles")
    visitDurationMinutes?: number;
    distanceFromPrevious?: number;
    travelTimeFromPrevious?: number;
    travelMode?: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";
  }>; // Trip itinerary stops

  // Artifact system (unified carousel)
  artifacts: Artifact[];
  activeArtifactId?: string;

  // Imperative requests to the map view (handled by MapView)
  fitBoundsRequest?: { bounds: MapBounds; token: string };

  // Actions
  setCenter: (center: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  setBounds: (bounds: MapBounds) => void;
  addMarker: (marker: MapMarker) => void;
  addMarkers: (markers: MapMarker[]) => void;
  removeMarker: (id: string) => void;
  clearMarkers: () => void;
  addRoute: (route: MapRoute) => void;
  removeRoute: (id: string) => void;
  clearRoutes: () => void;
  addHighlight: (highlight: MapHighlight) => void;
  clearHighlights: () => void;
  setSelectedRoute: (routeId: string | undefined) => void;
  setSelectedPlace: (placeId: string | undefined) => void;
  setTripStops: (stops: MapState['tripStops']) => void;
  addArtifact: (artifact: Artifact) => void;
  setActiveArtifact: (artifactId: string | undefined) => void;
  removeArtifact: (artifactId: string) => void;

  // Execute map commands from tool responses
  executeMapCommands: (commands: any[]) => void;
}

export const useMapState = create<MapState>((set) => ({
  // Initial state
  center: { lat: 37.7749, lng: -122.4194 }, // Default: San Francisco
  zoom: 12,
  markers: [],
  routes: [],
  highlights: [],
  selectedRouteId: undefined,
  selectedPlaceId: undefined,
  tripStops: undefined,
  artifacts: [],
  activeArtifactId: undefined,

  // Setters
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setBounds: (bounds) => set({ bounds }),

  // Marker management
  addMarker: (marker) =>
    set((state) => ({
      markers: [...state.markers, marker],
    })),

  addMarkers: (newMarkers) =>
    set((state) => ({
      markers: [...state.markers, ...newMarkers],
    })),

  removeMarker: (id) =>
    set((state) => ({
      markers: state.markers.filter((m) => m.id !== id),
    })),

  clearMarkers: () => set({ markers: [] }),

  // Route management
  addRoute: (route) =>
    set((state) => ({
      routes: [...state.routes, route],
    })),

  removeRoute: (id) =>
    set((state) => ({
      routes: state.routes.filter((r) => r.id !== id),
    })),

  clearRoutes: () => set({ routes: [] }),

  // Highlight management
  addHighlight: (highlight) =>
    set((state) => ({
      highlights: [...state.highlights, highlight],
    })),
  clearHighlights: () => set({ highlights: [] }),
  setSelectedRoute: (routeId) => set({ selectedRouteId: routeId }),
  setSelectedPlace: (placeId) => set({ selectedPlaceId: placeId }),
  setTripStops: (stops) => set({ tripStops: stops }),

  // Artifact management
  addArtifact: (artifact) =>
    set((state) => ({
      artifacts: [...state.artifacts, artifact],
      activeArtifactId: artifact.id,
    })),
  setActiveArtifact: (artifactId) => set({ activeArtifactId: artifactId }),
  removeArtifact: (artifactId) =>
    set((state) => ({
      artifacts: state.artifacts.filter((a) => a.id !== artifactId),
      activeArtifactId:
        state.activeArtifactId === artifactId
          ? state.artifacts.length > 1
            ? state.artifacts[state.artifacts.length - 2].id
            : undefined
          : state.activeArtifactId,
    })),

  // Execute commands from tool responses
  executeMapCommands: (commands) => {
    console.log('[MapState] executeMapCommands called with', commands.length, 'commands');
    
    // Detect artifact type from commands
    let artifactType: ArtifactType | null = null;
    let artifactTitle = '';
    let hasRoutes = false;
    let hasPlaces = false;
    let hasTrip = false;

    // Pre-scan commands to determine artifact type
    for (const cmd of commands) {
      if (cmd.type === 'DRAW_ROUTE') {
        hasRoutes = true;
        if (cmd.payload.metadata?.isTrip) {
          hasTrip = true;
        }
      }
      if (cmd.type === 'SHOW_ON_MAP' && cmd.payload.markers) {
        const markers = cmd.payload.markers;
        const hasTripMarkers = markers.some((m: any) => m.metadata?.isTripStop);
        if (hasTripMarkers) {
          hasTrip = true;
        } else {
          hasPlaces = true;
        }
      }
      if (cmd.type === 'SET_TRIP_STOPS') {
        hasTrip = true;
      }
    }

    // Determine artifact type and title
    if (hasTrip) {
      artifactType = 'trip';
      artifactTitle = 'Trip Itinerary';
    } else if (hasPlaces) {
      artifactType = 'places';
      // Count places from markers
      const placeCount = commands
        .filter(cmd => cmd.type === 'SHOW_ON_MAP' && cmd.payload.markers)
        .reduce((count, cmd) => count + (cmd.payload.markers?.length || 0), 0);
      artifactTitle = placeCount > 1 ? `${placeCount} Places` : 'Place';
    } else if (hasRoutes) {
      artifactType = 'routes';
      const routeCount = commands.filter(cmd => cmd.type === 'DRAW_ROUTE').length;
      artifactTitle = routeCount > 1 ? `${routeCount} Routes` : 'Route';
    }

    // Execute commands
    commands.forEach((cmd) => {
      console.log('[MapState] Processing command:', cmd.type, cmd.payload);
      switch (cmd.type) {
        case 'SHOW_ON_MAP': {
          const { markers } = cmd.payload;
          console.log('[MapState] SHOW_ON_MAP received with', markers?.length || 0, 'markers');
          if (Array.isArray(markers)) {
            console.log('[MapState] Adding markers:', markers.map(m => ({ id: m.id, title: m.title, position: m.position })));
            set((state) => ({
              markers: [...state.markers, ...markers],
            }));
          } else {
            console.warn('[MapState] SHOW_ON_MAP payload does not contain markers array');
          }
          break;
        }

        case 'PAN_TO': {
          const location = cmd.payload;
          console.log('[MapState] PAN_TO executing - setting center to:', location);
          set({ center: location });
          break;
        }

        case 'DRAW_ROUTE': {
          const { polyline, color, weight, opacity, metadata } = cmd.payload;
          console.log('[MapState] DRAW_ROUTE received:', { 
            hasPolyline: !!polyline,
            polylineLength: polyline?.length || 0,
            color, 
            weight, 
            opacity, 
            isPrimary: metadata?.isPrimary,
            isTrip: metadata?.isTrip
          });
          
          if (!polyline) {
            console.error('[MapState] DRAW_ROUTE missing polyline!');
            break;
          }
          
          const route: MapRoute = {
            id: `route-${Date.now()}-${Math.random()}`,
            polyline,
            color: color || '#4285F4',
            weight: weight || 3,
            opacity: opacity || 0.9,
            metadata,
          };
          set((state) => {
            const newRoutes = [...state.routes, route];
            console.log('[MapState] Route added, total routes:', newRoutes.length);
            return { routes: newRoutes };
          });
          break;
        }

        case 'SET_TRIP_STOPS': {
          const stops = cmd.payload;
          console.log('[MapState] SET_TRIP_STOPS executing - setting trip stops:', stops?.length || 0);
          set({ tripStops: stops });
          break;
        }

        case 'SET_ZOOM': {
          console.log('[MapState] SET_ZOOM executing - setting zoom to:', cmd.payload);
          set({ zoom: cmd.payload });
          break;
        }

        case 'CLEAR_MARKERS': {
          console.log('[MapState] CLEAR_MARKERS executing');
          set({ markers: [], selectedPlaceId: undefined });
          break;
        }

        case 'CLEAR_ROUTES': {
          console.log('[MapState] CLEAR_ROUTES executing');
          set({ routes: [], selectedRouteId: undefined });
          break;
        }

        case 'FIT_BOUNDS': {
          const bounds = cmd.payload;
          console.log('[MapState] FIT_BOUNDS executing - setting fitBoundsRequest:', bounds);
          if (bounds && typeof bounds === 'object') {
            set({ fitBoundsRequest: { bounds, token: `${Date.now()}-${Math.random()}` } });
          }
          break;
        }

        case 'HIGHLIGHT_AREA': {
          const payload = cmd.payload;
          if (payload?.bounds) {
            const id = `highlight-${Date.now()}-${Math.random()}`;
            set((state) => ({
              highlights: [
                ...state.highlights,
                {
                  id,
                  type: 'rectangle',
                  bounds: payload.bounds,
                  color: payload.color || '#22c55e',
                },
              ],
            }));
          }
          break;
        }

        case 'CLEAR_HIGHLIGHTS': {
          set({ highlights: [] });
          break;
        }

        default:
          console.warn('Unknown map command:', cmd.type);
      }
    });
    
    // Create artifact after all commands are processed
    if (artifactType) {
      set((state) => {
        const artifact: Artifact = {
          id: `artifact-${Date.now()}-${Math.random()}`,
          type: artifactType!,
          title: artifactTitle,
          timestamp: new Date(),
          data: {},
        };
        return {
          artifacts: [...state.artifacts, artifact],
          activeArtifactId: artifact.id,
        };
      });
    }
  },
}));
