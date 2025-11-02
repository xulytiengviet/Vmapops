'use client';

import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import { useState, useCallback, useRef, useEffect } from 'react';
import { Place, Location } from '@/lib/types';

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
    const [routePolyline, setRoutePolyline] = useState<Location[] | null>(null);

    const containerStyle = {
        width: '100%',
        height: '100%',
    };

    const onLoad = useCallback((map: google.maps.Map) => {
        mapRef.current = map;
    }, []);

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

    return (
        <GoogleMap
            mapContainerStyle={containerStyle}
            center={center}
            zoom={zoom}
            onLoad={onLoad}
            onUnmount={onUnmount}
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

            {/* Place markers */}
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

            {/* Route polyline */}
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
        </GoogleMap>
    );
}
