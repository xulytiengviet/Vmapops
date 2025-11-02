'use client';

import { useState, useEffect } from 'react';
import { LoadScript } from '@react-google-maps/api';
import { MapView } from './components/MapView';
import { ChatInterface } from './components/ChatInterface';
import { Navbar } from './components/Navbar';
import { Place, Location } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { initializeServices } from '@/lib/services';

// Static libraries array to prevent recreation
const GOOGLE_MAPS_LIBRARIES: ('places' | 'geometry' | 'drawing' | 'marker')[] = [
    'places',
];

export default function Home() {
    const [mapCenter, setMapCenter] = useState<Location>({ lat: 40.7128, lng: -74.006 });
    const [mapZoom, setMapZoom] = useState(13);
    const [userLocation, setUserLocation] = useState<Location | null>(null);
    const [places] = useState<Place[]>([]);
    const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
    const [mapsLoaded, setMapsLoaded] = useState(false);

    // Initialize services when Google Maps loads
    useEffect(() => {
        if (mapsLoaded) {
            initializeServices();
        }
    }, [mapsLoaded]);

    // Request user location on mount
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const location: Location = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    };
                    setUserLocation(location);
                    setMapCenter(location);
                },
                (err) => {
                    // Handle geolocation errors gracefully
                    const errorMessage = err.message || 'Geolocation error';
                    const errorCode = err.code;
                    
                    // Log detailed error info for debugging
                    console.warn('Geolocation error:', {
                        code: errorCode,
                        message: errorMessage,
                        fullError: err,
                    });
                    
                    // Common error codes:
                    // 1 = PERMISSION_DENIED
                    // 2 = POSITION_UNAVAILABLE
                    // 3 = TIMEOUT
                    if (errorCode === 1) {
                        console.info('User denied geolocation permission - location features will be limited');
                    } else if (errorCode === 2) {
                        console.info('Geolocation position unavailable - using default location');
                    } else if (errorCode === 3) {
                        console.info('Geolocation request timeout - using default location');
                    }
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000, // Cache for 5 minutes
                }
            );
        } else {
            console.warn('Geolocation is not supported by this browser');
        }
    }, []);

    // Don't update state on map pan - let map control its own pan
    // Only update when we explicitly set location (geolocation, place selection)

    const handleMarkerClick = (place: Place) => {
        setSelectedPlace(place);
    };

    const handlePlaceSelect = (place: Place) => {
        setSelectedPlace(place);
        setMapCenter(place.location);
        setMapZoom(16);
    };

    if (!mapsLoaded) {
        return (
            <LoadScript
                googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}
                libraries={GOOGLE_MAPS_LIBRARIES}
                onLoad={() => setMapsLoaded(true)}
            >
                <div className="flex items-center justify-center h-screen bg-gray-100">
                    <div className="text-center">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
                        <p className="text-gray-600">Loading MapOps...</p>
                    </div>
                </div>
            </LoadScript>
        );
    }

    return (
        <LoadScript
            googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}
            libraries={GOOGLE_MAPS_LIBRARIES}
        >
            <div className="flex h-screen bg-gray-100 flex-col">
                {/* Navbar */}
                <Navbar />

                {/* Main Content */}
                <div className="flex flex-1 overflow-hidden pt-16">
                {/* Map - Left side */}
                <div className="flex-1 relative overflow-hidden">
                    <MapView
                        center={mapCenter}
                        zoom={mapZoom}
                        places={places}
                        selectedPlace={selectedPlace}
                        userLocation={userLocation}
                        onMarkerClick={handleMarkerClick}
                    />
                </div>

                {/* Right side - Chat and Details */}
                <div className="w-96 bg-white shadow-lg flex flex-col overflow-hidden">
                    {/* Chat Interface */}
                    <ChatInterface onPlaceSelect={handlePlaceSelect} />

                    {/* Selected Place Details */}
                    {selectedPlace && (
                        <div className="border-t border-gray-200 p-4 bg-gray-50 max-h-48 overflow-y-auto">
                            <h3 className="font-semibold text-gray-900 mb-2">
                                {selectedPlace.displayName || selectedPlace.name}
                            </h3>

                            <div className="space-y-2 text-sm">
                                {selectedPlace.rating && (
                                    <div>
                                        <p className="text-gray-600">
                                            ⭐ {selectedPlace.rating.toFixed(1)} rating
                                        </p>
                                    </div>
                                )}

                                <p className="text-gray-600">{selectedPlace.formattedAddress}</p>

                                {selectedPlace.websiteUri && (
                                    <a
                                        href={selectedPlace.websiteUri}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline"
                                    >
                                        Visit Website
                                    </a>
                                )}

                                {selectedPlace.internationalPhoneNumber && (
                                    <a
                                        href={`tel:${selectedPlace.internationalPhoneNumber}`}
                                        className="text-blue-600 hover:underline block"
                                    >
                                        {selectedPlace.internationalPhoneNumber}
                                    </a>
                                )}
                            </div>

                            <button
                                onClick={() => setSelectedPlace(null)}
                                className="mt-4 w-full rounded bg-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-400"
                            >
                                Close
                            </button>
                        </div>
                    )}
                    </div>
                </div>
            </div>
        </LoadScript>
    );
}
