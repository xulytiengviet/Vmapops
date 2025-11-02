'use client';

import { GoogleMap, Marker, Polyline, Rectangle } from '@react-google-maps/api';
import { useState, useCallback, useRef, useEffect } from 'react';
import { Place, Location } from '@/lib/types';
import { useMapState } from '@/app/hooks/useMapState';
import { decodePolyline } from '@/lib/utils/polyline-decoder';
import { ArtifactCarousel } from './ArtifactCarousel';

interface MapViewProps {
    center: Location;
    zoom?: number;
    places: Place[];
    selectedPlace?: Place | null;
    userLocation?: Location | null;
    onMarkerClick?: (place: Place) => void;
}

export function MapView({
    center,
    zoom = 13,
    places,
    selectedPlace: _selectedPlace,
    userLocation,
    onMarkerClick,
}: MapViewProps) {
    const mapRef = useRef<google.maps.Map | null>(null);
    const [routePolyline] = useState<Location[] | null>(null);
    const mapState = useMapState();
    const [mapReady, setMapReady] = useState(false);

    // Log map state changes for debugging
    useEffect(() => {
        console.log('[MapView] Map state updated:', {
            markersCount: mapState.markers.length,
            routesCount: mapState.routes.length,
            center: mapState.center,
            zoom: mapState.zoom,
            markers: mapState.markers.map(m => ({ id: m.id, title: m.title, position: m.position })),
            routes: mapState.routes.map(r => ({ id: r.id, color: r.color, weight: r.weight })),
        });
    }, [mapState.markers, mapState.routes, mapState.center, mapState.zoom]);

    const containerStyle = {
        width: '100%',
        height: '100%',
    };

    const onLoad = useCallback((map: google.maps.Map) => {
        mapRef.current = map;
        // Initialize starting view
        try {
            map.setCenter(center as any);
            map.setZoom(zoom as any);
        } catch {}
        // Mark map ready after first idle to ensure tiles/viewport initialized
        map.addListener('idle', () => {
            setMapReady(true);
        });
    }, [center, zoom]);

    const onUnmount = useCallback(() => {
        mapRef.current = null;
    }, []);

    // Update bounds in global state when map bounds change
    const handleBoundsChanged = useCallback(() => {
        const map = mapRef.current;
        if (!map) return;
        const b = map.getBounds();
        if (!b) return;
        const ne = b.getNorthEast();
        const sw = b.getSouthWest();
        mapState.setBounds({
            north: ne.lat(),
            south: sw.lat(),
            east: ne.lng(),
            west: sw.lng(),
        });
    }, [mapState]);

    // React to fitBounds requests from agent commands
    useEffect(() => {
        if (!mapRef.current || !mapState.fitBoundsRequest) return;
        const { bounds } = mapState.fitBoundsRequest;
        const googleBounds = new google.maps.LatLngBounds(
            { lat: bounds.south, lng: bounds.west },
            { lat: bounds.north, lng: bounds.east }
        );
        mapRef.current.fitBounds(googleBounds);
    }, [mapState.fitBoundsRequest?.token]);

    // Imperatively update map when store center changes
    useEffect(() => {
        if (mapRef.current && mapReady && mapState.center) {
            console.log('[MapView] Imperatively panning map to', mapState.center);
            mapRef.current.panTo(mapState.center);
        }
    }, [mapState.center, mapReady]);

    useEffect(() => {
        if (mapRef.current && mapReady && typeof mapState.zoom === 'number') {
            console.log('[MapView] Imperatively setting zoom to', mapState.zoom);
            mapRef.current.setZoom(mapState.zoom);
        }
    }, [mapState.zoom, mapReady]);

    return (
        <div className="relative w-full h-full">
        <GoogleMap
            mapContainerStyle={containerStyle}
            onLoad={onLoad}
            onUnmount={onUnmount}
            onBoundsChanged={handleBoundsChanged}
            options={{
                streetViewControl: false,
                mapTypeControl: true,
                fullscreenControl: true,
            }}
        >
            {/* User location marker */}
            {userLocation && (
                <Marker
                    position={userLocation}
                    title="Your Location"
                    icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: '#4285F4',
                        fillOpacity: 0.8,
                        strokeColor: '#fff',
                        strokeWeight: 2,
                    }}
                />
            )}

            {/* Place markers from props */}
            {places.map((place) => {
                const placeId = place.id || `place-${place.location.lat}-${place.location.lng}`;
                const isSelected = mapState.selectedPlaceId === placeId;
                
                return (
                <Marker
                        key={placeId}
                    position={place.location}
                    title={place.displayName || place.name || 'Place'}
                        onClick={() => {
                            // Toggle selection when marker is clicked
                            if (mapState.selectedPlaceId === placeId) {
                                mapState.setSelectedPlace(undefined);
                            } else {
                                mapState.setSelectedPlace(placeId);
                            }
                            onMarkerClick?.(place);
                        }}
                    icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                            scale: isSelected ? 12 : 10, // Larger when selected
                            fillColor: isSelected ? '#4285F4' : '#FF6B6B',
                            fillOpacity: isSelected ? 1.0 : 0.9,
                        strokeColor: '#fff',
                            strokeWeight: isSelected ? 3 : 2,
                    }}
                        zIndex={isSelected ? 1000 : 500} // Bring selected to front
                />
                );
            })}

            {/* Markers from map state (agent-driven searches) */}
            {mapState.markers.map((marker) => {
                const isSelected = mapState.selectedPlaceId === marker.id;
                const isPlace = marker.type === 'place';
                const isTripStop = marker.metadata?.isTripStop;
                const stopNumber = marker.metadata?.stopNumber;
                
                // For trip stops, use numbered marker icon
                if (isTripStop && stopNumber) {
                    return (
                <Marker
                    key={marker.id}
                    position={marker.position}
                    title={marker.title}
                            onClick={() => {
                                if (mapState.selectedPlaceId === marker.id) {
                                    mapState.setSelectedPlace(undefined);
                                } else {
                                    mapState.setSelectedPlace(marker.id);
                                }
                            }}
                    icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                                scale: isSelected ? 14 : 12,
                                fillColor: isSelected ? '#4285F4' : '#FF6B00',
                                fillOpacity: isSelected ? 1.0 : 0.9,
                        strokeColor: '#fff',
                                strokeWeight: isSelected ? 4 : 3,
                            }}
                            label={{
                                text: String(stopNumber),
                                color: '#fff',
                                fontSize: '12px',
                                fontWeight: 'bold',
                    }}
                            zIndex={isSelected ? 1000 : 600}
                />
                    );
                }
                
                return (
                    <Marker
                        key={marker.id}
                        position={marker.position}
                        title={marker.title}
                        onClick={() => {
                            if (mapState.selectedPlaceId === marker.id) {
                                mapState.setSelectedPlace(undefined);
                            } else {
                                mapState.setSelectedPlace(marker.id);
                            }
                        }}
                        icon={{
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: isSelected ? 12 : (isPlace ? 10 : 8),
                            fillColor: isSelected ? '#4285F4' : (isPlace ? '#FF6B6B' : '#9CA3AF'),
                            fillOpacity: isSelected ? 1.0 : 0.9,
                            strokeColor: isSelected ? '#fff' : '#fff',
                            strokeWeight: isSelected ? 3 : 2,
                        }}
                        zIndex={isSelected ? 1000 : (isPlace ? 500 : 100)}
                    />
                );
            })}

            {/* Route polyline from props */}
            {routePolyline && routePolyline.length > 1 && (
                <Polyline
                    path={routePolyline}
                    options={{
                        strokeColor: '#FF0000',
                        strokeOpacity: 0.7,
                        strokeWeight: 3,
                    }}
                />
            )}

            {/* Routes from map state (agent-driven directions) */}
            {mapState.routes.map((route) => {
              try {
                const decodedPoints = decodePolyline(route.polyline);
                const isSelected = mapState.selectedRouteId === route.id;
                const baseWeight = route.weight || 3;
                const selectedWeight = baseWeight + 2; // Make selected route thicker
                
                // Dim routes that aren't connected to selected stop
                let routeOpacity = route.opacity || 0.9;
                if (mapState.selectedPlaceId && mapState.selectedPlaceId.startsWith('trip-stop-')) {
                  const selectedStopNumber = parseInt(mapState.selectedPlaceId.replace('trip-stop-', ''));
                  const routeStartStop = route.metadata?.startStop;
                  const routeEndStop = route.metadata?.endStop;
                  
                  // Route is connected if it starts/ends at the selected stop
                  const isConnected = routeStartStop === selectedStopNumber || routeEndStop === selectedStopNumber;
                  
                  if (!isSelected && !isConnected) {
                    routeOpacity = 0.2; // Dim unconnected routes
                  } else if (isConnected && !isSelected) {
                    routeOpacity = Math.min(routeOpacity * 1.2, 1.0); // Slightly brighten connected routes
                  }
                }
                
                console.log(`[MapView] Rendering route ${route.id} with ${decodedPoints.length} points, selected: ${isSelected}`);
                return (
                  <Polyline
                    key={route.id}
                    path={decodedPoints}
                    options={{
                      strokeColor: route.color,
                      strokeOpacity: isSelected ? 1.0 : routeOpacity,
                      strokeWeight: isSelected ? selectedWeight : baseWeight,
                      clickable: true,
                      zIndex: isSelected ? 150 : (route.metadata?.isPrimary ? 100 : 50),
                    }}
                    onClick={() => {
                      console.log('[MapView] Route clicked:', route.metadata);
                      // Toggle selection when route is clicked on map
                      if (mapState.selectedRouteId === route.id) {
                        mapState.setSelectedRoute(undefined);
                      } else {
                        mapState.setSelectedRoute(route.id);
                      }
                    }}
                  />
                );
              } catch (error) {
                console.error(`[MapView] Error decoding polyline for route ${route.id}:`, error);
                return null;
              }
            })}

            {/* Highlights from map state (agent-driven highlights) */}
            {mapState.highlights.map((h) => (
              <Rectangle
                key={h.id}
                bounds={{
                  north: h.bounds.north,
                  south: h.bounds.south,
                  east: h.bounds.east,
                  west: h.bounds.west,
                }}
                options={{
                  strokeColor: h.color || '#22c55e',
                  strokeOpacity: 0.9,
                  strokeWeight: 2,
                  fillColor: h.color || '#22c55e',
                  fillOpacity: 0.1,
                  clickable: false,
                  zIndex: 25,
                }}
              />
            ))}
        </GoogleMap>
        
        {/* Unified Artifact Carousel */}
        <ArtifactCarousel />
    </div>
    );
}
