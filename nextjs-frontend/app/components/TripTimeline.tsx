'use client';

import { useMapState } from '@/app/hooks/useMapState';
import { Clock, MapPin, Route as RouteIcon, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface TripStopCardProps {
  stop: {
    stopNumber: number;
    category: string;
    name: string;
    address: string;
    rating?: number;
    estimatedArrival?: string;
    estimatedDeparture?: string;
    localArrivalTime?: string;
    localDepartureTime?: string;
    timeZoneId?: string;
    visitDurationMinutes?: number;
    distanceFromPrevious?: number;
    travelTimeFromPrevious?: number;
    travelMode?: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";
  };
  onClick?: () => void;
  isSelected: boolean;
}

function formatTime(isoString?: string): string {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return 'N/A';
  }
}

function formatDuration(minutes?: number): string {
  if (!minutes) return 'N/A';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}

function formatDistance(meters?: number): string {
  if (!meters) return '';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function TripStopCard({ stop, onClick, isSelected }: TripStopCardProps) {
  const getCategoryIcon = () => {
    const catLower = stop.category.toLowerCase();
    if (catLower.includes('coffee') || catLower.includes('cafe')) return '☕';
    if (catLower.includes('restaurant') || catLower.includes('food') || catLower.includes('meal') || catLower.includes('brunch') || catLower.includes('lunch') || catLower.includes('dinner')) return '🍽️';
    if (catLower.includes('museum') || catLower.includes('gallery')) return '🏛️';
    if (catLower.includes('activity') || catLower.includes('tour')) return '🎯';
    if (catLower.includes('park')) return '🌳';
    if (catLower.includes('shop') || catLower.includes('store')) return '🛍️';
    if (catLower.includes('wine') || catLower.includes('winery')) return '🍷';
    if (catLower.includes('hotel') || catLower.includes('lodging')) return '🏨';
    return '📍';
  };

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-xl border-2 p-4 cursor-pointer transition-all flex-shrink-0
        ${isSelected ? 'border-blue-500 border-opacity-100 shadow-xl scale-105' : 'border-gray-300 border-opacity-70 hover:border-opacity-100'}
        ${onClick ? 'hover:shadow-xl' : ''}
        bg-white backdrop-blur-sm
      `}
      style={{
        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.95)',
        minWidth: '320px',
        maxWidth: '320px',
        ...(isSelected && {
          boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.2), 0 8px 16px -4px rgba(0, 0, 0, 0.2)',
        }),
      }}
    >
      {isSelected && (
        <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-xl bg-blue-500" />
      )}

      <div className="flex items-start gap-3">
        {/* Stop Number Badge */}
        <div className={`
          flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
          ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}
        `}>
          {stop.stopNumber}
        </div>

        <div className="flex-1 min-w-0">
          {/* Category and Name */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl flex-shrink-0">{getCategoryIcon()}</span>
            <span className="font-semibold text-gray-900 text-sm truncate" title={stop.name}>
              {stop.name}
            </span>
          </div>

          {/* Category Label */}
          <div className="text-xs text-gray-500 mb-2 capitalize">
            {stop.category}
          </div>

          {/* Rating */}
          {stop.rating && (
            <div className="flex items-center gap-1 mb-2">
              <span className="text-xs font-semibold text-yellow-600">⭐ {stop.rating.toFixed(1)}</span>
            </div>
          )}

          {/* Address */}
          {stop.address && (
            <div className="flex items-start gap-1 mb-3">
              <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
              <span className="text-xs text-gray-600 line-clamp-2">{stop.address}</span>
            </div>
          )}

          {/* Timing */}
          <div className="space-y-1">
            {stop.estimatedArrival && (
              <div className="flex items-center gap-2 text-xs text-gray-700">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                <span>
                  <strong>Arrive:</strong> {stop.localArrivalTime || formatTime(stop.estimatedArrival)}
                  {stop.timeZoneId && <span className="text-gray-500 ml-1">({stop.timeZoneId.split('/')[1] || stop.timeZoneId})</span>}
                </span>
              </div>
            )}
            {stop.estimatedDeparture && (
              <div className="flex items-center gap-2 text-xs text-gray-700">
                <Calendar className="w-3.5 h-3.5 text-green-500" />
                <span>
                  <strong>Depart:</strong> {stop.localDepartureTime || formatTime(stop.estimatedDeparture)}
                  {stop.timeZoneId && <span className="text-gray-500 ml-1">({stop.timeZoneId.split('/')[1] || stop.timeZoneId})</span>}
                </span>
                {stop.visitDurationMinutes && (
                  <span className="text-gray-500">({formatDuration(stop.visitDurationMinutes)} visit)</span>
                )}
              </div>
            )}
            {stop.travelTimeFromPrevious !== undefined && stop.travelTimeFromPrevious > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-600 mt-1 pt-1 border-t border-gray-200">
                <RouteIcon className="w-3.5 h-3.5 text-gray-400" />
                <span>
                  Travel: {formatDuration(stop.travelTimeFromPrevious)}
                  {stop.travelMode && (
                    <span className="ml-1 text-gray-500">
                      ({stop.travelMode === "WALK" ? "🚶" : stop.travelMode === "TRANSIT" ? "🚇" : stop.travelMode === "BICYCLE" ? "🚴" : "🚗"})
                    </span>
                  )}
                </span>
                {stop.distanceFromPrevious && (
                  <span className="text-gray-500">({formatDistance(stop.distanceFromPrevious)})</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TripTimeline() {
  const mapState = useMapState();
  const tripStops = mapState.tripStops || [];

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
  }, [tripStops.length]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 340;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const handleStopClick = (stopNumber: number) => {
    const markerId = `trip-stop-${stopNumber}`;
    const marker = mapState.markers.find(m => m.id === markerId);
    if (marker) {
      mapState.setSelectedPlace(markerId);
      mapState.setCenter(marker.position);
      const index = tripStops.findIndex(s => s.stopNumber === stopNumber);
      if (scrollContainerRef.current && index >= 0) {
        const cardWidth = 320 + 12;
        scrollContainerRef.current.scrollTo({
          left: index * cardWidth,
          behavior: 'smooth',
        });
      }
    }
    return undefined;
  };

  if (tripStops.length === 0) {
    return null;
  }

  const hasRoutes = mapState.routes.length > 0;
  const hasPlaces = mapState.markers.filter(m => m.type === 'place').length > 0;
  
  // Position above route/place carousels if they exist
  let bottomOffset = 'bottom-4';
  if (hasRoutes) bottomOffset = 'bottom-32';
  if (hasRoutes && hasPlaces) bottomOffset = 'bottom-64';

  return (
    <div className={`absolute ${bottomOffset} left-1/2 transform -translate-x-1/2 z-50 w-full max-w-5xl px-4`}>
      <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200/50 p-3">
        <div className="flex items-center justify-between mb-2 px-2">
          <div className="flex items-center gap-2">
            <RouteIcon className="w-4 h-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">
              Trip Itinerary • {tripStops.length} Stop{tripStops.length !== 1 ? 's' : ''}
            </h3>
          </div>
          {tripStops.length > 3 && (
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

        <div
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth pb-2"
        >
          {tripStops.map((stop) => {
            const markerId = `trip-stop-${stop.stopNumber}`;
            const isSelected = mapState.selectedPlaceId === markerId;
            return (
              <TripStopCard
                key={stop.stopNumber}
                stop={stop}
                onClick={() => handleStopClick(stop.stopNumber)}
                isSelected={isSelected}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

