'use client';

import { GoogleMap, Marker, Polyline, Rectangle } from '@react-google-maps/api';
import { useState, useCallback, useRef, useEffect } from 'react';
import { Place, Location } from '@/lib/types';
import { useMapState } from '@/app/hooks/useMapState';
import { decodePolyline } from '@/lib/utils/polyline-decoder';
import { RouteCarousel } from './RouteCarousel';

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
    selectedPlace,
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

    // Get marker color based on selection
    const getMarkerColor = (place: Place): string => {
        if (selectedPlace?.id === place.id) {
            return '#FF0000'; // Red for selected
        }
        return '#4285F4'; // Blue for regular places
    };

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
            {places.map((place) => (
                <Marker
                    key={place.id}
                    position={place.location}
                    title={place.displayName || place.name || 'Place'}
                    onClick={() => onMarkerClick?.(place)}
                    icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: getMarkerColor(place),
                        fillOpacity: 0.8,
                        strokeColor: '#fff',
                        strokeWeight: 2,
                    }}
                />
            ))}

            {/* Markers from map state (agent-driven searches) */}
            {mapState.markers.map((marker) => (
                <Marker
                    key={marker.id}
                    position={marker.position}
                    title={marker.title}
                    icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: '#FF6B6B',
                        fillOpacity: 0.8,
                        strokeColor: '#fff',
                        strokeWeight: 2,
                    }}
                />
            ))}

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
                console.log(`[MapView] Rendering route ${route.id} with ${decodedPoints.length} points, selected: ${isSelected}`);
                return (
                  <Polyline
                    key={route.id}
                    path={decodedPoints}
                    options={{
                      strokeColor: route.color,
                      strokeOpacity: isSelected ? 1.0 : (route.opacity || 0.9),
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
        
        {/* Route Carousel Overlay */}
        <RouteCarousel />
    </div>
    );
}
