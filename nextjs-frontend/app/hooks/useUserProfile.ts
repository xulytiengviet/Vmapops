'use client';

/**
 * User Profile Store
 * Manages user's saved places like home, work, and favorites
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SavedPlace {
  id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  type: 'home' | 'work' | 'favorite';
  placeId?: string; // Google Places ID if available
  createdAt: Date;
}

export interface UserProfile {
  home?: SavedPlace;
  work?: SavedPlace;
  favorites: SavedPlace[];
  
  // Actions
  setHome: (place: Omit<SavedPlace, 'id' | 'type' | 'createdAt'>) => void;
  setWork: (place: Omit<SavedPlace, 'id' | 'type' | 'createdAt'>) => void;
  addFavorite: (place: Omit<SavedPlace, 'id' | 'type' | 'createdAt'>) => void;
  removeFavorite: (id: string) => void;
  removeHome: () => void;
  removeWork: () => void;
  getPlaceByName: (name: string) => SavedPlace | undefined;
  getAllPlaces: () => SavedPlace[];
}

export const useUserProfile = create<UserProfile>()(
  persist(
    (set, get) => ({
      home: undefined,
      work: undefined,
      favorites: [],

      setHome: (place) =>
        set({
          home: {
            ...place,
            id: `home-${Date.now()}`,
            type: 'home',
            createdAt: new Date(),
          },
        }),

      setWork: (place) =>
        set({
          work: {
            ...place,
            id: `work-${Date.now()}`,
            type: 'work',
            createdAt: new Date(),
          },
        }),

      addFavorite: (place) =>
        set((state) => ({
          favorites: [
            ...state.favorites,
            {
              ...place,
              id: `fav-${Date.now()}-${Math.random()}`,
              type: 'favorite',
              createdAt: new Date(),
            },
          ],
        })),

      removeFavorite: (id) =>
        set((state) => ({
          favorites: state.favorites.filter((f) => f.id !== id),
        })),

      removeHome: () => set({ home: undefined }),
      removeWork: () => set({ work: undefined }),

      getPlaceByName: (name) => {
        const state = get();
        const normalizedName = name.toLowerCase().trim();
        
        if (normalizedName === 'home' && state.home) return state.home;
        if (normalizedName === 'work' && state.work) return state.work;
        
        // Check favorites by name
        return state.favorites.find(
          (f) => f.name.toLowerCase() === normalizedName
        );
      },

      getAllPlaces: () => {
        const state = get();
        const places: SavedPlace[] = [];
        if (state.home) places.push(state.home);
        if (state.work) places.push(state.work);
        places.push(...state.favorites);
        return places;
      },
    }),
    {
      name: 'user-profile-storage',
    }
  )
);

