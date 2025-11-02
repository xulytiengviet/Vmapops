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

export interface MapState {
  // Viewport
  center: { lat: number; lng: number };
  zoom: number;
  bounds?: MapBounds;

  // Elements
  markers: MapMarker[];
  routes: MapRoute[];
  highlights: MapHighlight[];

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

  // Execute commands from tool responses
  executeMapCommands: (commands) => {
    console.log('[MapState] executeMapCommands called with', commands.length, 'commands');
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
            isPrimary: metadata?.isPrimary 
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

        case 'SET_ZOOM': {
          console.log('[MapState] SET_ZOOM executing - setting zoom to:', cmd.payload);
          set({ zoom: cmd.payload });
          break;
        }

        case 'CLEAR_MARKERS': {
          set({ markers: [] });
          break;
        }

        case 'CLEAR_ROUTES': {
          set({ routes: [] });
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
  },
}));
