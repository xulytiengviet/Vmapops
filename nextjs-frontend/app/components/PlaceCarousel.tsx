'use client';

import { useMapState, MapMarker } from '@/app/hooks/useMapState';
import { Clock, MapPin, Star, Store, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Place } from '@/lib/types';
import { VibeIndicator } from './VibeScoreCard';

interface PlaceCardProps {
  marker: MapMarker;
  onClick?: () => void;
  isSelected: boolean;
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatWalkTime(meters: number): string {
  const minutes = Math.round(meters / 80); // ~80m per minute walking
  return `${minutes} min walk`;
}

function PlaceCard({ marker, onClick, isSelected }: PlaceCardProps) {
  const place = marker.metadata || {};
  const name = place.name || place.displayName || marker.title;
  const rating = place.rating || place.ratingValue;
  const ratingCount = place.userRatingCount || place.reviewCount || 0;
  const address = place.formattedAddress || place.address || '';
  const distance = place.distanceMeters || 0;
  const priceLevel = place.priceLevel;
  const category = place.type || place.category || 'place';

  // Calculate vibe score if semantic attributes are present
  const vibeScore = place.semanticAttributes
    ? Object.values(place.semanticAttributes).reduce((sum: number, attr: any) => sum + (attr.score || 0), 0) /
      Object.keys(place.semanticAttributes).length
    : undefined;

  const getCategoryIcon = () => {
    const catLower = category.toLowerCase();
    if (catLower.includes('cafe') || catLower.includes('coffee')) return '☕';
    if (catLower.includes('restaurant') || catLower.includes('food') || catLower.includes('dining')) return '🍽️';
    if (catLower.includes('park') || catLower.includes('recreation')) return '🌳';
    if (catLower.includes('museum') || catLower.includes('gallery')) return '🏛️';
    if (catLower.includes('library') || catLower.includes('book')) return '📚';
    if (catLower.includes('store') || catLower.includes('shop') || catLower.includes('retail')) return '🛍️';
    if (catLower.includes('hotel') || catLower.includes('lodging')) return '🏨';
    if (catLower.includes('hospital') || catLower.includes('clinic') || catLower.includes('medical')) return '🏥';
    if (catLower.includes('school') || catLower.includes('university') || catLower.includes('education')) return '🏫';
    if (catLower.includes('theater') || catLower.includes('cinema') || catLower.includes('movie')) return '🎭';
    if (catLower.includes('gym') || catLower.includes('fitness') || catLower.includes('sport')) return '💪';
    if (catLower.includes('gas') || catLower.includes('fuel')) return '⛽';
    if (catLower.includes('bank') || catLower.includes('atm')) return '🏦';
    if (catLower.includes('church') || catLower.includes('temple') || catLower.includes('religious')) return '⛪';
    if (catLower.includes('pharmacy') || catLower.includes('drug')) return '💊';
    return '📍';
  };

  const getPriceSymbol = () => {
    if (!priceLevel) return '';
    return '$'.repeat(priceLevel);
  };

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-xl border-2 p-3 cursor-pointer transition-all flex-shrink-0
        ${isSelected ? 'border-blue-500 border-opacity-100 shadow-xl scale-105' : 'border-gray-300 border-opacity-70 hover:border-opacity-100'}
        ${onClick ? 'hover:shadow-xl' : ''}
        bg-white backdrop-blur-sm
      `}
      style={{
        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.95)',
        minWidth: '300px',
        maxWidth: '300px',
        ...(isSelected && {
          boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.2), 0 8px 16px -4px rgba(0, 0, 0, 0.2)',
        }),
      }}
    >
      {/* Selected indicator bar */}
      {isSelected && (
        <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-xl bg-blue-500" />
      )}

      <div className="mt-1">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-lg flex-shrink-0">{getCategoryIcon()}</span>
            <span className="font-semibold text-gray-900 text-sm truncate" title={name}>
              {name}
            </span>
          </div>
          {priceLevel && (
            <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
              {getPriceSymbol()}
            </span>
          )}
        </div>

        {/* Rating and Vibe Score */}
        <div className="flex items-center justify-between mb-2">
          {rating && (
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              <span className="text-xs font-semibold text-gray-700">{rating.toFixed(1)}</span>
              {ratingCount > 0 && (
                <span className="text-xs text-gray-500">({ratingCount})</span>
              )}
            </div>
          )}
          {vibeScore !== undefined && vibeScore > 0 && (
            <VibeIndicator score={vibeScore} />
          )}
        </div>

        {/* Address */}
        {address && (
          <div className="flex items-start gap-1 mb-2">
            <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
            <span className="text-xs text-gray-600 line-clamp-2">{address}</span>
          </div>
        )}

        {/* Distance & Walk Time */}
        {distance > 0 && (
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1 text-xs text-gray-700">
              <MapPin className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-semibold">{formatDistance(distance)}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-700">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-semibold">{formatWalkTime(distance)}</span>
            </div>
          </div>
        )}

        {/* Vibe Attributes */}
        {place.semanticAttributes && (
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(place.semanticAttributes)
              .filter(([_, data]: [string, any]) => data.score > 0.7)
              .slice(0, 2)
              .map(([attr, _data]: [string, any]) => (
                <span
                  key={attr}
                  className="px-1.5 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700 flex items-center gap-0.5"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  {attr.replace(/_/g, ' ')}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PlaceCarousel({ places = [] }: { places?: Place[] }) {
  const mapState = useMapState();
  const markers = mapState.markers;

  // Filter markers that are places (not route endpoints)
  const placeMarkers = markers.filter(
    (marker) => marker.type === 'place' && marker.metadata
  );

  // Convert props-based places to MapMarker format for consistency
  const propsPlaceMarkers: MapMarker[] = places.map((place) => ({
    id: place.id || `place-${place.location.lat}-${place.location.lng}`,
    position: place.location,
    title: place.displayName || place.name || 'Place',
    type: 'place' as const,
    metadata: {
      ...place,
      name: place.displayName || place.name,
      displayName: place.displayName,
      ratingValue: place.rating,
      reviewCount: place.userRatingCount,
      type: place.types?.[0] || 'place',
      category: place.types?.[0] || 'place',
      distanceMeters: place.distance || 0,
    },
  }));

  // Combine both sources
  const allPlaceMarkers = [...placeMarkers, ...propsPlaceMarkers];

  // Remove duplicates by ID
  const uniquePlaceMarkers = allPlaceMarkers.filter((marker, index, self) =>
    index === self.findIndex((m) => m.id === marker.id)
  );

  // Sort by distance if available, otherwise by order added
  const sortedPlaces = [...uniquePlaceMarkers].sort((a, b) => {
    const aDist = a.metadata?.distanceMeters || Infinity;
    const bDist = b.metadata?.distanceMeters || Infinity;
    return aDist - bDist;
  });

  // Check if routes are displayed to adjust position
  const hasRoutes = mapState.routes.length > 0;
  const bottomOffset = hasRoutes ? 'bottom-32' : 'bottom-4'; // Stack above routes if present

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScrollability = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    checkScrollability();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollability);
      return () => container.removeEventListener('scroll', checkScrollability);
    }
    return undefined;
  }, [sortedPlaces.length]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 320;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  if (sortedPlaces.length === 0) {
    return null;
  }

  const handlePlaceClick = (marker: MapMarker) => {
    // Toggle selection - if already selected, deselect
    if (mapState.selectedPlaceId === marker.id) {
      mapState.setSelectedPlace(undefined);
    } else {
      mapState.setSelectedPlace(marker.id);
      // Pan to place
      mapState.setCenter(marker.position);
      // Scroll to selected place
      const index = sortedPlaces.findIndex(m => m.id === marker.id);
      if (scrollContainerRef.current && index >= 0) {
        const cardWidth = 300 + 12; // card width + gap
        scrollContainerRef.current.scrollTo({
          left: index * cardWidth,
          behavior: 'smooth',
        });
      }
    }
  };

  return (
    <div className={`absolute ${bottomOffset} left-1/2 transform -translate-x-1/2 z-50 w-full max-w-5xl px-4`}>
      <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200/50 p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 px-2">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">
              {sortedPlaces.length} Place{sortedPlaces.length !== 1 ? 's' : ''} Found
            </h3>
          </div>
          {sortedPlaces.length > 3 && (
            <div className="flex gap-1">
              <button
                onClick={() => scroll('left')}
                disabled={!canScrollLeft}
                className={`p-1.5 rounded-lg transition-all ${
                  canScrollLeft
                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scroll('right')}
                disabled={!canScrollRight}
                className={`p-1.5 rounded-lg transition-all ${
                  canScrollRight
                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                }`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Carousel */}
        <div
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth pb-2"
        >
          {sortedPlaces.map((marker) => (
            <PlaceCard
              key={marker.id}
              marker={marker}
              onClick={() => handlePlaceClick(marker)}
              isSelected={mapState.selectedPlaceId === marker.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

