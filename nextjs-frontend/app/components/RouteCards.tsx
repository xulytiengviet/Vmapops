'use client';

import { useMapState, MapRoute } from '@/app/hooks/useMapState';
import { Clock, MapPin, Route as RouteIcon } from 'lucide-react';

interface RouteCardProps {
  route: MapRoute;
  onClick?: () => void;
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

function RouteCard({ route, onClick }: RouteCardProps) {
  const mapState = useMapState();
  const isSelected = mapState.selectedRouteId === route.id;
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

  const getModeLabel = () => {
    switch (travelMode) {
      case 'TRANSIT':
        return 'Transit';
      case 'WALK':
        return 'Walking';
      case 'BICYCLE':
        return 'Biking';
      case 'DRIVE':
        return 'Driving';
      default:
        return 'Route';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-lg border-2 p-4 cursor-pointer transition-all
        ${isSelected ? 'border-opacity-100 shadow-lg ring-2 ring-offset-2' : isPrimary ? 'border-opacity-100 shadow-md' : 'border-opacity-60 hover:border-opacity-100'}
        ${onClick ? 'hover:shadow-lg' : ''}
      `}
      style={{
        borderColor: route.color,
        backgroundColor: isSelected ? `${route.color}15` : `${route.color}08`, // Brighter when selected
        ...(isSelected && {
          boxShadow: `0 0 0 2px ${route.color}40, 0 4px 6px -1px rgba(0, 0, 0, 0.1)`,
        }),
      }}
    >
      {/* Color indicator bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
        style={{ backgroundColor: route.color }}
      />

      {/* Badge */}
      {isPrimary && (
        <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-semibold px-2 py-1 rounded-full">
          Recommended
        </div>
      )}

      <div className="mt-1">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{getModeIcon()}</span>
            <span className="font-semibold text-gray-900">{routeLabel}</span>
          </div>
          <span className="text-xs text-gray-500 uppercase">{getModeLabel()}</span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1 text-sm text-gray-700">
            <MapPin className="w-4 h-4" />
            <span className="font-medium">{formatDistance(distance)}</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-gray-700">
            <Clock className="w-4 h-4" />
            <span className="font-medium">{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Route index indicator */}
        <div className="mt-2 flex items-center gap-1">
          <RouteIcon className="w-3 h-3" style={{ color: route.color }} />
          <span className="text-xs text-gray-500" style={{ color: route.color }}>
            Option {metadata.routeIndex !== undefined ? metadata.routeIndex + 1 : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function RouteCards() {
  const mapState = useMapState();
  const routes = mapState.routes;

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

  if (sortedRoutes.length === 0) {
    return null;
  }

  const handleRouteClick = (route: MapRoute) => {
    // Toggle selection - if already selected, deselect
    if (mapState.selectedRouteId === route.id) {
      mapState.setSelectedRoute(undefined);
    } else {
      mapState.setSelectedRoute(route.id);
    }
    console.log('[RouteCards] Route clicked:', route.metadata);
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <RouteIcon className="w-4 h-4 text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-700">
          {sortedRoutes.length} Route{sortedRoutes.length !== 1 ? 's' : ''} Available
        </h3>
      </div>
      <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
        {sortedRoutes.map((route) => (
          <RouteCard 
            key={route.id} 
            route={route} 
            onClick={() => handleRouteClick(route)} 
          />
        ))}
      </div>
    </div>
  );
}

