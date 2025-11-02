/**
 * Polyline Decoder Utility
 * Decodes Google Maps encoded polylines to arrays of coordinates
 *
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 *
 * The algorithm compresses a sequence of coordinates by:
 * 1. Taking the initial point
 * 2. For each subsequent point, storing only the difference from the previous point
 * 3. Encoding differences using variable-length encoding
 * 4. Converting to ASCII characters
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Decode an encoded polyline string from Google Maps API
 *
 * @param encoded - The encoded polyline string from Google Maps
 * @returns Array of {lat, lng} coordinate objects
 *
 * @example
 * const encoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
 * const points = decodePolyline(encoded);
 * // points = [{lat: 38.5, lng: -120.2}, {lat: 40.7, lng: -120.95}, ...]
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const len = encoded.length;

  while (index < len) {
    let result = 0;
    let shift = 0;
    let b: number;

    // Decode latitude
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;

    // Decode longitude
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return points;
}

/**
 * Encode an array of coordinates to an encoded polyline string
 * Useful for sending coordinates back to the API
 *
 * @param points - Array of {lat, lng} coordinate objects
 * @returns Encoded polyline string
 */
export function encodePolyline(points: LatLng[]): string {
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const dlat = point.lat - prevLat;
    const dlng = point.lng - prevLng;

    encoded += _encodeValue(Math.round(dlat * 1e5));
    encoded += _encodeValue(Math.round(dlng * 1e5));

    prevLat = point.lat;
    prevLng = point.lng;
  }

  return encoded;
}

/**
 * Helper function to encode a single value in the polyline algorithm
 */
function _encodeValue(value: number): string {
  value = value << 1;
  if (value < 0) {
    value = ~value;
  }

  let encoded = '';
  while (value >= 0x20) {
    const chunk = (0x20 | (value & 0x1f)) + 63;
    encoded += String.fromCharCode(chunk);
    value >>= 5;
  }

  encoded += String.fromCharCode(value + 63);
  return encoded;
}
