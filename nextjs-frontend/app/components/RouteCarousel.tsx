'use client';

import { useMapState, MapRoute } from '@/app/hooks/useMapState';
import { Clock, MapPin, Route as RouteIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface RouteCardProps {
  route: MapRoute;
  onClick?: () => void;
  isSelected: boolean;
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return 'N/A';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}

function RouteCard({ route, onClick, isSelected }: RouteCardProps) {
  const metadata = route.metadata || {};
  const isPrimary = metadata.isPrimary || false;
  const distance = metadata.distance || 0;
  const duration = metadata.duration || 0;
  const routeLabel = metadata.routeLabel || `Route ${metadata.routeIndex || 0}`;
  const travelMode = metadata.travelMode || 'DRIVE';

  const getModeIcon = () => {
    switch (travelMode) {
      case 'TRANSIT':
        return '🚇';
      case 'WALK':
        return '🚶';
      case 'BICYCLE':
        return '🚴';
      case 'DRIVE':
        return '🚗';
      default:
        return '📍';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-xl border-2 p-3 cursor-pointer transition-all flex-shrink-0
        ${isSelected ? 'border-opacity-100 shadow-xl scale-105' : isPrimary ? 'border-opacity-100 shadow-lg' : 'border-opacity-70 hover:border-opacity-100'}
        ${onClick ? 'hover:shadow-xl' : ''}
        bg-white backdrop-blur-sm
      `}
      style={{
        borderColor: route.color,
        backgroundColor: isSelected ? `${route.color}20` : 'rgba(255, 255, 255, 0.95)',
        minWidth: '280px',
        maxWidth: '280px',
        ...(isSelected && {
          boxShadow: `0 0 0 3px ${route.color}40, 0 8px 16px -4px rgba(0, 0, 0, 0.2)`,
        }),
      }}
    >
      {/* Color indicator bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1.5 rounded-t-xl"
        style={{ backgroundColor: route.color }}
      />

      {/* Badge */}
      {isPrimary && (
        <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
          Best
        </div>
      )}

      <div className="mt-1">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{getModeIcon()}</span>
            <span className="font-semibold text-gray-900 text-sm">{routeLabel}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1 text-xs text-gray-700">
            <MapPin className="w-3.5 h-3.5" style={{ color: route.color }} />
            <span className="font-semibold">{formatDistance(distance)}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-700">
            <Clock className="w-3.5 h-3.5" style={{ color: route.color }} />
            <span className="font-semibold">{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Route index indicator */}
        <div className="mt-2 flex items-center gap-1">
          <RouteIcon className="w-3 h-3" style={{ color: route.color }} />
          <span className="text-xs text-gray-500 font-medium" style={{ color: route.color }}>
            Option {metadata.routeIndex !== undefined ? metadata.routeIndex + 1 : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function RouteCarousel() {
  const mapState = useMapState();
  const routes = mapState.routes;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Filter routes that have metadata (are from directions)
  const directionRoutes = routes.filter(
    (route) => route.metadata && route.metadata.routeIndex !== undefined
  );

  // Sort routes: primary first, then by index
  const sortedRoutes = [...directionRoutes].sort((a, b) => {
    const aPrimary = a.metadata?.isPrimary ? 0 : 1;
    const bPrimary = b.metadata?.isPrimary ? 0 : 1;
    if (aPrimary !== bPrimary) return aPrimary - bPrimary;
    return (a.metadata?.routeIndex || 0) - (b.metadata?.routeIndex || 0);
  });

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
  }, [sortedRoutes.length]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 300;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  if (sortedRoutes.length === 0) {
    return null;
  }

  const handleRouteClick = (route: MapRoute) => {
    // Toggle selection - if already selected, deselect
    if (mapState.selectedRouteId === route.id) {
      mapState.setSelectedRoute(undefined);
    } else {
      mapState.setSelectedRoute(route.id);
      // Scroll to selected route
      const index = sortedRoutes.findIndex(r => r.id === route.id);
      if (scrollContainerRef.current && index >= 0) {
        const cardWidth = 280 + 12; // card width + gap
        scrollContainerRef.current.scrollTo({
          left: index * cardWidth,
          behavior: 'smooth',
        });
      }
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-4xl px-4">
      <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200/50 p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 px-2">
          <div className="flex items-center gap-2">
            <RouteIcon className="w-4 h-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">
              {sortedRoutes.length} Route{sortedRoutes.length !== 1 ? 's' : ''} Available
            </h3>
          </div>
          {sortedRoutes.length > 3 && (
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
          {sortedRoutes.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              onClick={() => handleRouteClick(route)}
              isSelected={mapState.selectedRouteId === route.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

