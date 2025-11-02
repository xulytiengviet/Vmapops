'use client';

import { Place } from '@/lib/types';
import { formatDistance, formatDuration } from '@/lib/utils';
import { Star, MapPin, Phone, Globe, Navigation, Clock } from 'lucide-react';

interface PlaceCardProps {
    place: Place;
    isSelected?: boolean;
    onClick?: () => void;
}

export function PlaceCard({ place, isSelected = false, onClick }: PlaceCardProps) {
    const renderRating = () => {
        if (!place.rating) return null;
        return (
            <div className="flex items-center gap-1">
                <div className="flex">
                    {[...Array(5)].map((_, i) => (
                        <Star
                            key={i}
                            size={16}
                            className={i < Math.round(place.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                        />
                    ))}
                </div>
                <span className="text-sm text-gray-600">
                    {place.rating.toFixed(1)} {place.userRatingCount && `(${place.userRatingCount})`}
                </span>
            </div>
        );
    };

    const renderPrice = () => {
        if (!place.priceLevel) return null;
        return (
            <div className="text-sm text-gray-600">
                {'$'.repeat(place.priceLevel)}
            </div>
        );
    };

    return (
        <div
            onClick={onClick}
            className={`rounded-lg border p-4 cursor-pointer transition-all ${isSelected
                ? 'border-blue-500 bg-blue-50 shadow-md'
                : 'border-gray-200 bg-white hover:shadow-md'
                }`}
        >
            {/* Header */}
            <div className="mb-3">
                <h3 className="font-semibold text-base text-gray-900 line-clamp-2">
                    {place.displayName || place.name || 'Unknown Place'}
                </h3>
            </div>

            {/* Rating and Price */}
            <div className="mb-3 flex items-center justify-between">
                {renderRating()}
                {renderPrice()}
            </div>

            {/* Address */}
            <div className="mb-3 flex gap-2">
                <MapPin size={16} className="flex-shrink-0 text-gray-500 mt-0.5" />
                <p className="text-sm text-gray-600 line-clamp-2">
                    {place.formattedAddress}
                </p>
            </div>

            {/* Distance and Duration (if available) */}
            {(place.distance || place.duration) && (
                <div className="mb-3 flex gap-4 text-sm text-gray-600">
                    {place.distance && (
                        <div className="flex items-center gap-1">
                            <Navigation size={14} />
                            {formatDistance(place.distance)}
                        </div>
                    )}
                    {place.duration && (
                        <div className="flex items-center gap-1">
                            <Clock size={14} />
                            {formatDuration(place.duration)}
                        </div>
                    )}
                </div>
            )}

            {/* Open Status */}
            {place.openNow !== undefined && (
                <div className="mb-3">
                    <span
                        className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${place.openNow
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                            }`}
                    >
                        {place.openNow ? 'Open Now' : 'Closed'}
                    </span>
                </div>
            )}

            {/* Contact Info */}
            <div className="space-y-1 border-t pt-3">
                {place.internationalPhoneNumber && (
                    <a
                        href={`tel:${place.internationalPhoneNumber}`}
                        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                    >
                        <Phone size={14} />
                        {place.internationalPhoneNumber}
                    </a>
                )}

                {place.websiteUri && (
                    <a
                        href={place.websiteUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                    >
                        <Globe size={14} />
                        Visit Website
                    </a>
                )}
            </div>
        </div>
    );
}
