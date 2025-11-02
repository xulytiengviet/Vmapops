'use client';

import { useMapState } from '@/app/hooks/useMapState';
import { RoutesService } from '@/lib/services/routes-service';
import { Clock, MapPin, Route as RouteIcon, Star, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export type ArtifactType = 'routes' | 'places' | 'trip';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  timestamp: Date;
  data: any;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return 'N/A';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}

function formatTime(isoString?: string): string {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'N/A';
  }
}

function formatVisitDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}

function getCategoryIcon(category: string): string {
  const catLower = category.toLowerCase();
  if (catLower.includes('coffee') || catLower.includes('cafe')) return '☕';
  if (catLower.includes('restaurant') || catLower.includes('food') || catLower.includes('lunch') || catLower.includes('dinner') || catLower.includes('brunch')) return '🍽️';
  if (catLower.includes('museum') || catLower.includes('gallery')) return '🏛️';
  if (catLower.includes('park') || catLower.includes('recreation')) return '🌳';
  if (catLower.includes('activity') || catLower.includes('tour')) return '✨';
  if (catLower.includes('shop') || catLower.includes('store')) return '🛍️';
  if (catLower.includes('wine') || catLower.includes('winery')) return '🍷';
  if (catLower.includes('hotel') || catLower.includes('lodging')) return '🏨';
  if (catLower.includes('gym') || catLower.includes('fitness')) return '💪';
  return '📍';
}

function getModeIcon(mode: string): string {
  switch (mode) {
    case 'TRANSIT': return '🚇';
    case 'WALK': return '🚶';
    case 'BICYCLE': return '🚴';
    case 'DRIVE': return '🚗';
    default: return '📍';
  }
}

// Helper to adjust color brightness for alternative routes
function adjustColorBrightness(hex: string, factor: number): string {
  // Remove # if present
  hex = hex.replace('#', '');
  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Adjust brightness
  const newR = Math.max(0, Math.min(255, Math.round(r * (1 - factor))));
  const newG = Math.max(0, Math.min(255, Math.round(g * (1 - factor))));
  const newB = Math.max(0, Math.min(255, Math.round(b * (1 - factor))));
  // Convert back to hex
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// Route Card Component
function RouteCard({ route, onClick, isSelected }: { route: any; onClick?: () => void; isSelected: boolean }) {
  const metadata = route.metadata || {};
  const isPrimary = metadata.isPrimary || false;
  const distance = metadata.distance || 0;
  // Duration can be in seconds (from metadata.duration) or durationSeconds from route
  const durationSeconds = metadata.duration || metadata.durationSeconds || 0;
  const routeLabel = metadata.routeLabel || `Route ${metadata.routeIndex || 0}`;
  const travelMode = metadata.travelMode || 'DRIVE';
  const transitSteps = metadata.transitSteps || [];
  const transitFare = metadata.transitFare;

  // Format transit fare
  const formatFare = (fare: any) => {
    if (!fare) return null;
    const units = parseInt(fare.units || '0', 10);
    const nanos = fare.nanos || 0;
    const total = units + (nanos / 1000000000);
    return `${fare.currencyCode || 'USD'} ${total.toFixed(2)}`;
  };

  // Get vehicle icon based on type
  const getVehicleIcon = (type: string) => {
    switch (type) {
      case 'BUS': return '🚌';
      case 'SUBWAY': return '🚇';
      case 'TRAIN': case 'COMMUTER_TRAIN': case 'LONG_DISTANCE_TRAIN': case 'HEAVY_RAIL': return '🚂';
      case 'TRAM': case 'METRO_RAIL': return '🚋';
      case 'FERRY': return '⛴️';
      case 'CABLE_CAR': return '🚠';
      case 'GONDOLA_LIFT': return '🚡';
      case 'FUNICULAR': return '🚞';
      case 'MONORAIL': return '🚝';
      case 'TROLLEYBUS': return '🚎';
      case 'HIGH_SPEED_TRAIN': return '🚄';
      case 'INTERCITY_BUS': return '🚍';
      case 'RAIL': return '🚆';
      case 'SHARE_TAXI': return '🚕';
      case 'OTHER': return '🚐';
      default: return '🚇';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-xl border-2 p-4 cursor-pointer transition-all flex-shrink-0
        ${isSelected ? 'border-blue-500 shadow-xl scale-105' : 'border-gray-300 hover:border-gray-400'}
        bg-white backdrop-blur-sm
      `}
      style={{
        minWidth: '280px',
        maxWidth: '280px',
        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.95)',
      }}
    >
      {isSelected && <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-xl bg-blue-500" />}
      {isPrimary && (
        <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
          Recommended
        </div>
      )}
      <div className="mt-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{getModeIcon(travelMode)}</span>
          <span className="font-semibold text-gray-900">{routeLabel}</span>
        </div>
        
        {/* Transit line info */}
        {transitSteps.length > 0 && (
          <div className="mb-2 space-y-1">
            {transitSteps.map((step: any, idx: number) => (
              <div key={idx} className="flex items-center gap-2 text-xs bg-gray-50 rounded px-2 py-1">
                <span className="text-base">{getVehicleIcon(step.transitLine?.vehicle?.type || 'BUS')}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate" style={{
                    color: step.transitLine?.textColor || '#000',
                  }}>
                    {step.transitLine?.nameShort || step.transitLine?.name || 'Transit'}
                  </div>
                  {step.headsign && (
                    <div className="text-gray-600 text-xs truncate">→ {step.headsign}</div>
                  )}
                  <div className="flex items-center gap-2 text-gray-500 text-xs">
                    {step.stopCount > 0 && (
                      <span>{step.stopCount} stops</span>
                    )}
                    {step.localizedValues?.departureTime?.time && (
                      <span>• Departs: {step.localizedValues.departureTime.time}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 text-sm text-gray-700">
          <div className="flex items-center gap-1">
            <RouteIcon className="w-4 h-4 text-gray-500" />
            <span>{formatDistance(distance)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4 text-gray-500" />
            <span>{formatDuration(durationSeconds)}</span>
          </div>
        </div>

        {/* Transit fare */}
        {transitFare && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <span>💰</span>
              <span>Fare: {formatFare(transitFare)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Place Card Component
function PlaceCard({ marker, onClick, isSelected }: { marker: any; onClick?: () => void; isSelected: boolean }) {
  const place = marker.metadata || {};
  const name = place.name || place.displayName || marker.title;
  const rating = place.rating || place.ratingValue;
  const address = place.formattedAddress || place.address || '';
  const distance = place.distanceMeters || 0;
  const category = place.type || place.category || 'place';
  const semanticAttributes = place.semanticAttributes || {};

  // Get semantic attributes with scores > 0.4 (threshold for showing)
  const activeAttributes = Object.entries(semanticAttributes)
    .filter(([_, data]: [string, any]) => data && data.score > 0.4 && data.count > 0)
    .map(([attr, data]: [string, any]) => ({
      name: attr,
      count: data.count,
      score: data.score,
      evidence: data.evidence?.[0] || '', // First evidence excerpt
    }))
    .sort((a, b) => b.score - a.score); // Sort by score descending

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-xl border-2 p-3 cursor-pointer transition-all flex-shrink-0
        ${isSelected ? 'border-blue-500 shadow-xl scale-105' : 'border-gray-300 hover:border-gray-400'}
        bg-white backdrop-blur-sm
      `}
      style={{
        minWidth: '280px',
        maxWidth: '280px',
        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.95)',
      }}
    >
      {isSelected && <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-xl bg-blue-500" />}
      <div className="mt-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{getCategoryIcon(category)}</span>
          <span className="font-semibold text-gray-900 text-sm truncate" title={name}>{name}</span>
        </div>
        {rating && (
          <div className="flex items-center gap-1 mb-1">
            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
            <span className="text-xs text-gray-700">{rating.toFixed(1)}</span>
          </div>
        )}
        
        {/* Semantic Attribute Chips */}
        {activeAttributes.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {activeAttributes.map((attr) => (
              <div
                key={attr.name}
                className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium flex items-center gap-1"
                title={attr.evidence ? `"${attr.evidence}"` : `${attr.name} (${attr.count} mentions)`}
              >
                <span className="capitalize">{attr.name}</span>
                <span className="text-blue-500 font-semibold">({attr.count})</span>
              </div>
            ))}
          </div>
        )}
        
        {address && (
          <div className="flex items-start gap-1 text-xs text-gray-600 mb-1">
            <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{address}</span>
          </div>
        )}
        {distance > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            <span>{formatDistance(distance)} walk</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Trip Stop Card Component
function TripStopCard({ stop, onClick, isSelected }: { stop: any; onClick?: () => void; isSelected: boolean }) {
  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-xl border-2 p-3 cursor-pointer transition-all flex-shrink-0
        ${isSelected ? 'border-blue-500 shadow-xl scale-105' : 'border-gray-300 hover:border-gray-400'}
        bg-white backdrop-blur-sm
      `}
      style={{
        minWidth: '320px',
        maxWidth: '320px',
        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.95)',
      }}
    >
      {isSelected && <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-xl bg-blue-500" />}
      <div className="mt-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg font-bold text-blue-600">{stop.stopNumber}.</span>
          <span className="text-lg">{getCategoryIcon(stop.category)}</span>
          <span className="font-semibold text-gray-900 text-sm truncate" title={stop.name}>{stop.name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-700 mb-1">
          <Clock className="w-3.5 h-3.5 text-gray-500" />
          <span>
            {stop.localArrivalTime || formatTime(stop.estimatedArrival)} - {stop.localDepartureTime || formatTime(stop.estimatedDeparture)}
            {stop.timeZoneId && <span className="text-gray-500 text-xs ml-1">({stop.timeZoneId.split('/')[1] || stop.timeZoneId})</span>}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
          <span>Visit: {formatVisitDuration(stop.visitDurationMinutes || 0)}</span>
          {stop.travelTimeFromPrevious !== undefined && stop.travelTimeFromPrevious > 0 && (
            <>
              <span className="mx-1">•</span>
              <RouteIcon className="w-3.5 h-3.5 text-gray-500" />
              <span>
                Travel: {formatVisitDuration(stop.travelTimeFromPrevious)}
                {stop.travelMode && <span className="ml-1">({getModeIcon(stop.travelMode)})</span>}
              </span>
            </>
          )}
        </div>
        {stop.address && (
          <div className="flex items-start gap-1 text-xs text-gray-600">
            <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{stop.address}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ArtifactCarousel() {
  const mapState = useMapState();
  const artifacts = mapState.artifacts || [];
  const activeArtifactId = mapState.activeArtifactId;
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [routeMode, setRouteMode] = useState<'WALK' | 'TRANSIT' | 'BICYCLE' | 'DRIVE'>('WALK');
  const [isComputingRoutes, setIsComputingRoutes] = useState(false);

  const activeArtifact = artifacts.find(a => a.id === activeArtifactId);
  const activeIndex = artifacts.findIndex(a => a.id === activeArtifactId);

  // Set initial route mode based on trip stops' travel mode
  useEffect(() => {
    if (activeArtifact?.type === 'trip' && mapState.tripStops && mapState.tripStops.length > 0) {
      const firstStopMode = mapState.tripStops[0]?.travelMode;
      if (firstStopMode && routeMode !== firstStopMode) {
        // Only set if it's different from current mode and we have routes already
        // Otherwise, the trip-plan tool already set the routes for the initial mode
        const hasRoutes = mapState.routes.length > 0;
        if (!hasRoutes) {
          setRouteMode(firstStopMode as 'WALK' | 'TRANSIT' | 'BICYCLE' | 'DRIVE');
        }
      }
    }
  }, [activeArtifactId, mapState.tripStops]);

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
  }, [activeArtifact?.data]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  }, [activeArtifactId]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 300;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const handleCardClick = (itemId: string, artifactType: ArtifactType) => {
    if (artifactType === 'routes') {
      mapState.setSelectedRoute(itemId);
    } else if (artifactType === 'places' || artifactType === 'trip') {
      mapState.setSelectedPlace(itemId);
      const marker = mapState.markers.find(m => m.id === itemId);
      if (marker) {
        mapState.setCenter(marker.position);
      }
      
      // For trip stops, highlight routes connected to this stop
      if (artifactType === 'trip' && marker?.metadata?.stopNumber) {
        const stopNumber = marker.metadata.stopNumber;
        // Find routes that connect to/from this stop
        // A route connects to a stop if:
        // - It starts at stopNumber (routeStartStop === stopNumber)
        // - It ends at stopNumber (routeEndStop === stopNumber)
        const connectedRoutes = mapState.routes.filter(route => {
          const routeStartStop = route.metadata?.startStop;
          const routeEndStop = route.metadata?.endStop;
          return routeStartStop === stopNumber || routeEndStop === stopNumber;
        });
        
        // If routes found, highlight the primary one
        if (connectedRoutes.length > 0) {
          const primaryRoute = connectedRoutes.find(r => r.metadata?.isPrimary) || connectedRoutes[0];
          if (primaryRoute) {
            mapState.setSelectedRoute(primaryRoute.id);
          }
        } else {
          // No connected routes, clear selection
          mapState.setSelectedRoute(undefined);
        }
      }
    }
  };

  const navigateToArtifact = (index: number) => {
    if (index >= 0 && index < artifacts.length) {
      const artifact = artifacts[index];
      mapState.setActiveArtifact(artifact.id);
      
      // Clear selections that don't belong to this artifact
      if (artifact.type === 'routes') {
        mapState.setSelectedPlace(undefined);
      } else {
        mapState.setSelectedRoute(undefined);
      }
    }
  };

  const closeArtifact = () => {
    mapState.setActiveArtifact(undefined);
  };

  // Re-compute trip routes for a selected mode using client-side RoutesService
  const recomputeTripRoutes = async (mode: 'WALK' | 'TRANSIT' | 'BICYCLE' | 'DRIVE') => {
    const stops = mapState.tripStops || [];
    if (!stops || stops.length < 2) return;
    setIsComputingRoutes(true);
    setRouteMode(mode);
    try {
      const service = new RoutesService();
      // Clear existing routes first
      mapState.clearRoutes();

      // Color palette for different route alternatives per leg
      const routeColors = ['#4285F4', '#34A853', '#FBBC04', '#EA4335', '#9C27B0', '#00BCD4'];

      for (let i = 0; i < stops.length - 1; i++) {
        const origin = stops[i].location;
        const destination = stops[i + 1].location;

        // For TRANSIT with waypoints, Google doesn't return alternatives when intermediates exist.
        // We compute each leg independently here, which works for all modes.
        const routes = await service.getDirections({
          origin,
          destination,
          travelMode: mode,
          alternatives: true,
        });

        if (routes && routes.length > 0) {
          // Draw all alternatives for this leg
          routes.forEach((r, idx) => {
            // Use consistent color per leg, different shades for alternatives
            const baseColor = routeColors[i % routeColors.length];
            const alternativeColor = idx === 0 ? baseColor : adjustColorBrightness(baseColor, idx * 0.15);
            
            mapState.addRoute({
              id: `trip-leg-${i}-alt-${idx}-${Date.now()}`,
              polyline: r.polyline,
              color: alternativeColor,
              weight: idx === 0 ? 5 : 3,
              opacity: idx === 0 ? 0.95 : 0.6,
              metadata: {
                legIndex: i,
                startStop: i + 1,
                endStop: i + 2,
                isPrimary: idx === 0,
                travelMode: mode,
                durationSeconds: r.durationSeconds,
                distanceMeters: r.distanceMeters,
                transitFare: r.transitFare,
                transitSteps: r.transitSteps,
                routeLabel: idx === 0 ? `Leg ${i + 1}→${i + 2} (Recommended)` : `Leg ${i + 1}→${i + 2} • Option ${idx + 1}`,
              },
            });
          });
        }
      }
    } catch (err) {
      console.error('[ArtifactCarousel] Failed to recompute routes:', err);
    } finally {
      setIsComputingRoutes(false);
    }
  };

  if (artifacts.length === 0 || !activeArtifact) {
    return null;
  }

  const renderCards = () => {
    if (!activeArtifact) return null;

    switch (activeArtifact.type) {
      case 'routes':
        return mapState.routes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            onClick={() => handleCardClick(route.id, 'routes')}
            isSelected={mapState.selectedRouteId === route.id}
          />
        ));

      case 'places':
        const placeMarkers = mapState.markers.filter(m => m.type === 'place' && !m.metadata?.isTripStop);
        return placeMarkers.map((marker) => (
          <PlaceCard
            key={marker.id}
            marker={marker}
            onClick={() => handleCardClick(marker.id, 'places')}
            isSelected={mapState.selectedPlaceId === marker.id}
          />
        ));

      case 'trip':
        return (mapState.tripStops || []).map((stop) => {
          const markerId = `trip-stop-${stop.stopNumber}`;
          return (
            <TripStopCard
              key={markerId}
              stop={stop}
              onClick={() => handleCardClick(markerId, 'trip')}
              isSelected={mapState.selectedPlaceId === markerId}
            />
          );
        });

      default:
        return null;
    }
  };

  const cards = renderCards();
  if (!cards || cards.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-6xl px-4">
      <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200/50 p-3">
        {/* Header with title and navigation */}
        <div className="flex items-center justify-between mb-2 px-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">
                {activeArtifact.type === 'routes' ? '🚇' : activeArtifact.type === 'trip' ? '🗺️' : '📍'}
              </span>
              <h3 className="text-sm font-semibold text-gray-700">
                {activeArtifact.title}
                {activeArtifact.type === 'trip' && mapState.tripStops
                  ? ` (${mapState.tripStops.length} Stops)`
                  : cards.length > 0 && ` (${cards.length})`}
              </h3>
            </div>
            
            {/* Mode toggles for Trip artifacts */}
            {activeArtifact.type === 'trip' && (
              <div className="flex items-center gap-1 ml-3 pl-3 border-l border-gray-200">
                <span className="text-xs text-gray-500 mr-1">Mode:</span>
                <button
                  onClick={() => recomputeTripRoutes('WALK')}
                  disabled={isComputingRoutes}
                  className={`px-2 py-1 rounded text-xs transition-all ${routeMode === 'WALK' ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  title="Walking"
                >🚶 Walk</button>
                <button
                  onClick={() => recomputeTripRoutes('TRANSIT')}
                  disabled={isComputingRoutes}
                  className={`px-2 py-1 rounded text-xs transition-all ${routeMode === 'TRANSIT' ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  title="Public Transit"
                >🚇 Transit</button>
                <button
                  onClick={() => recomputeTripRoutes('BICYCLE')}
                  disabled={isComputingRoutes}
                  className={`px-2 py-1 rounded text-xs transition-all ${routeMode === 'BICYCLE' ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  title="Bicycle"
                >🚴 Bike</button>
                <button
                  onClick={() => recomputeTripRoutes('DRIVE')}
                  disabled={isComputingRoutes}
                  className={`px-2 py-1 rounded text-xs transition-all ${routeMode === 'DRIVE' ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  title="Drive"
                >🚗 Drive</button>
                {isComputingRoutes && <span className="text-xs text-gray-500 ml-2">Recomputing…</span>}
              </div>
            )}

            {/* Artifact History Navigation */}
            {artifacts.length > 1 && (
              <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-300">
                <button
                  onClick={() => navigateToArtifact(activeIndex - 1)}
                  disabled={activeIndex === 0}
                  className={`p-1 rounded transition-all ${
                    activeIndex > 0
                      ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  }`}
                  title="Previous query"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span className="text-xs text-gray-500 px-1">
                  {activeIndex + 1}/{artifacts.length}
                </span>
                <button
                  onClick={() => navigateToArtifact(activeIndex + 1)}
                  disabled={activeIndex === artifacts.length - 1}
                  className={`p-1 rounded transition-all ${
                    activeIndex < artifacts.length - 1
                      ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  }`}
                  title="Next query"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Scroll arrows */}
            {cards.length > 3 && (
              <>
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
              </>
            )}
            {/* Close button */}
            <button
              onClick={closeArtifact}
              className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Route Legend for Trip artifacts */}
        {activeArtifact.type === 'trip' && mapState.routes.length > 0 && (
          <div className="mb-2 px-2 pb-2 border-b border-gray-200">
            <div className="flex items-center gap-4 flex-wrap text-xs">
              <span className="text-gray-500 font-medium">Route Legend:</span>
              {(() => {
                const routeColors = ['#4285F4', '#34A853', '#FBBC04', '#EA4335', '#9C27B0', '#00BCD4'];
                const legGroups = new Map<number, any[]>();
                
                mapState.routes.forEach(route => {
                  const legIndex = route.metadata?.legIndex;
                  if (legIndex !== undefined) {
                    if (!legGroups.has(legIndex)) {
                      legGroups.set(legIndex, []);
                    }
                    legGroups.get(legIndex)!.push(route);
                  }
                });
                
                return Array.from(legGroups.entries()).map(([legIndex, routes]) => {
                  const startStop = legIndex + 1;
                  const endStop = legIndex + 2;
                  const color = routeColors[legIndex % routeColors.length];
                  const hasAlternatives = routes.length > 1;
                  
                  return (
                    <div key={legIndex} className="flex items-center gap-1">
                      <div
                        className="w-4 h-1 rounded"
                        style={{ backgroundColor: color }}
                        title={`Leg ${startStop}→${endStop}${hasAlternatives ? ` (${routes.length} options)` : ''}`}
                      />
                      <span className="text-gray-600">
                        {startStop}→{endStop}
                        {hasAlternatives && <span className="text-gray-400 ml-1">({routes.length})</span>}
                      </span>
                    </div>
                  );
                });
              })()}
              <span className="text-gray-400 text-xs ml-auto">
                💡 Click a stop card to highlight its route • Click routes on map to compare
              </span>
            </div>
          </div>
        )}

        {/* Cards */}
        <div
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth pb-2"
        >
          {cards}
        </div>
      </div>
    </div>
  );
}

