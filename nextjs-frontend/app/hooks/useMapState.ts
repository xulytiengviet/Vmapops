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

export interface MapState {
  // Viewport
  center: { lat: number; lng: number };
  zoom: number;

  // Elements
  markers: MapMarker[];
  routes: MapRoute[];

  // Actions
  setCenter: (center: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  addMarker: (marker: MapMarker) => void;
  addMarkers: (markers: MapMarker[]) => void;
  removeMarker: (id: string) => void;
  clearMarkers: () => void;
  addRoute: (route: MapRoute) => void;
  removeRoute: (id: string) => void;
  clearRoutes: () => void;

  // Execute map commands from tool responses
  executeMapCommands: (commands: any[]) => void;
}

export const useMapState = create<MapState>((set) => ({
  // Initial state
  center: { lat: 37.7749, lng: -122.4194 }, // Default: San Francisco
  zoom: 12,
  markers: [],
  routes: [],

  // Setters
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),

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

  // Execute commands from tool responses
  executeMapCommands: (commands) => {
    commands.forEach((cmd) => {
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
          set({ center: location });
          break;
        }

        case 'DRAW_ROUTE': {
          const { polyline, color, weight, opacity, metadata } = cmd.payload;
          console.log('[MapState] DRAW_ROUTE received:', { color, weight, opacity, isPrimary: metadata?.isPrimary });
          const route: MapRoute = {
            id: `route-${Date.now()}-${Math.random()}`,
            polyline,
            color: color || '#4285F4',
            weight: weight || 3,
            opacity: opacity || 0.9,
            metadata,
          };
          set((state) => ({
            routes: [...state.routes, route],
          }));
          console.log('[MapState] Route added, total routes:', (state: any) => state.routes.length);
          break;
        }

        case 'SET_ZOOM': {
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

        default:
          console.warn('Unknown map command:', cmd.type);
      }
    });
  },
}));
