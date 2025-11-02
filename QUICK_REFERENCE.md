# MapOps - Quick Reference Card

## Service Methods at a Glance

### Places Service
```javascript
// Search
placesService.textSearch("coffee", {location, radius: 5000, maxResultCount: 20})
placesService.nearbySearch({lat, lng}, {radius: 1000})
placesService.autocomplete("coff", location)

// Details
placesService.getPlaceDetails(placeId, fields)
placesService.getPlaceDetailsNew(placeId, fields)

// Filtering
placesService.filterByWalkingDistance(places, origin, 15)  // minutes
placesService.filterPlaces(places, {openNow: true, minRating: 4})
placesService.isOpenNow(place)
```

### Routes Service
```javascript
// Routes
routesService.getRoute(origin, destination, {travelMode: 'WALK'})
routesService.optimizeRoute(origin, destination, waypoints)
routesService.renderRoute(routeData)

// Distance/Time
routesService.getDistanceMatrix(origins, destinations)
routesService.getWalkingTime(origin, destination)
```

### Geocoding Service
```javascript
geocodingService.geocode("1600 Amphitheatre Pkwy", {region: 'US'})
geocodingService.reverseGeocode({lat: 37.4, lng: -122.1})
geocodingService.validateAddress("123 Main St")
```

### Places Aggregate Service
```javascript
aggregateService.searchNearby(location, 1000, {includedTypes: ['restaurant']})
aggregateService.countByType(location, 1000, ['restaurant', 'cafe', 'bar'])
aggregateService.getDensityInsights([locations], 1000)
aggregateService.findHighDensityAreas(bounds, 500, ['restaurant'])
```

### Roads Service
```javascript
roadsService.snapToRoads(points, {interpolate: true})
roadsService.snapRoute(routePoints)
roadsService.getNearestRoads(points)
roadsService.getSpeedLimits(placeIds)
roadsService.getRoadInfo(point)
```

### Map Setup
```javascript
initMap()
getUserLocation()
getMapCenter()
getZoomLevel()
panToLocation({lat, lng}, zoom)
addMarker({lat, lng}, options)
clearMarkers(markerArray)
```

---

## Data Available from Each Service

### From Text/Nearby Search
```
id, displayName, formattedAddress, location
rating, userRatingCount, types
openNow, priceLevel
photos, internationalPhoneNumber, websiteUri
reviews, editorialSummary
```

### From Route
```
duration (seconds + text)
distanceMeters (+ text)
polyline.encodedPolyline
legs[] with duration, distance, startLocation, endLocation
steps[] with directions
```

### From Distance Matrix
```
duration[i][j]
distanceMeters[i][j]
status (OK, NOT_FOUND, etc)
```

### From Geocode
```
lat, lng
formattedAddress
addressComponents[]
placeId, types[]
```

### From Density Analysis
```
location, radius
counts (by type)
total, density (per sq meter)
```

---

## Common Patterns

### Find restaurants within 15 minutes walking
```javascript
const restaurants = await placesService.textSearch("restaurants", {
    location: userLocation,
    radius: 2000
});

const walkable = await placesService.filterByWalkingDistance(
    restaurants, 
    userLocation, 
    15
);
```

### Get best rated open places
```javascript
const places = await placesService.textSearch(query, {location: userLocation});
const filtered = placesService.filterPlaces(places, {
    openNow: true,
    minRating: 4.0
});
```

### Find high-density restaurant areas
```javascript
const density = await aggregateService.findHighDensityAreas(
    bounds,
    500,  // grid size
    ['restaurant']
);
// Returns top 10 areas with most restaurants
```

### Get walking time between places
```javascript
const time = await routesService.getWalkingTime(origin, destination);
console.log(`${time.durationText} (${time.distance}m)`);
```

### Analyze place distribution
```javascript
const counts = await aggregateService.countByType(
    location,
    1000,
    ['restaurant', 'cafe', 'bar']
);
// Returns: {restaurant: 45, cafe: 32, bar: 12}
```

---

## Travel Modes Supported
- `'DRIVE'` - Driving
- `'WALK'` - Walking  
- `'BICYCLE'` - Cycling
- `'TRANSIT'` - Public transit

---

## Feature Implementation Status

### Fully Working (Ready to Use)
✅ Place search (text & nearby)
✅ Place details retrieval
✅ Route calculation (all modes)
✅ Walking time/distance
✅ Geocoding (both directions)
✅ Place filtering
✅ Density analysis
✅ Marker management
✅ Map navigation

### Partially Working (Needs UI)
⚠️ Route rendering (code ready, not displayed)
⚠️ Info windows (not connected)
⚠️ Autocomplete (method exists, needs input)

### Not Implemented (Needs Development)
❌ Search to map connection
❌ Result display on map
❌ Info window popups
❌ Results list UI
❌ Filter UI controls
❌ Loading indicators
❌ Error messages

---

## API Endpoints Reference

### Places API v1
- POST `/places:searchText` - Text search
- POST `/places:searchNearby` - Nearby search  
- GET `/places/{placeId}` - Place details

### Routes API v2
- POST `/directions/v2:computeRoutes` - Get routes
- POST `/distanceMatrix/v2:computeRouteMatrix` - Distance matrix
- POST `/optimization/v1:optimizeTours` - Route optimization

### Address Validation API
- POST `/:geocode` - Geocoding
- POST `/:reverseGeocode` - Reverse geocoding
- POST `/:validateAddress` - Address validation

### Roads API
- GET `/snapToRoads` - Snap to roads
- GET `/nearestRoads` - Find nearest roads
- GET `/speedLimits` - Get speed limits

---

## Filtering Options

### Text Search
```javascript
{
    location: {lat, lng},
    radius: 5000,                    // meters
    maxResultCount: 20,              // results
    includedTypes: ['restaurant'],   // type filter
    excludedTypes: ['hospital'],     // exclude types
    openNow: true,                   // only open
    language: 'en'                   // language
}
```

### Nearby Search
```javascript
{
    radius: 1000,
    type: 'restaurant',
    keyword: 'pizza'
}
```

### Place Filters
```javascript
{
    openNow: true,
    minRating: 4.0,
    maxPriceLevel: 2,
    outdoorSeating: true            // data available only
}
```

### Aggregate Search
```javascript
{
    includedTypes: ['restaurant'],
    excludedTypes: ['hospital'],
    minRating: 3.5,
    maxPriceLevel: 3,
    openNow: true,
    language: 'en'
}
```

---

## Response Structure Examples

### Place Object
```javascript
{
    id: "ChIJrTLr...",
    displayName: "Olive Garden",
    formattedAddress: "123 Main St, San Francisco, CA",
    location: {latitude: 37.7749, longitude: -122.4194},
    rating: 4.2,
    userRatingCount: 1543,
    types: ["italian_restaurant", "restaurant", "food"],
    currentOpeningHours: {openNow: true},
    priceLevel: 2,
    internationalPhoneNumber: "+1 415-555-1234",
    websiteUri: "https://olivegarden.com",
    reviews: [{
        text: "Great service!",
        rating: 5,
        author: "John D."
    }],
    photos: [{name: "...", uri: "..."}]
}
```

### Route Object
```javascript
{
    routes: [{
        duration: "15 mins",
        distanceMeters: 1200,
        polyline: {
            encodedPolyline: "abc123..."
        },
        legs: [{
            duration: "15 mins",
            distance: "1.2 km",
            startLocation: {lat: 37.7, lng: -122.4},
            endLocation: {lat: 37.8, lng: -122.5}
        }],
        steps: [{...}]
    }]
}
```

### Density Insight Object
```javascript
{
    location: {lat: 37.7749, lng: -122.4194},
    radius: 1000,
    counts: {
        restaurant: 45,
        cafe: 32,
        bar: 12
    },
    total: 89,
    density: 0.00283  // places per square meter
}
```

---

## Known Limitations

1. **Max Results:** 20 per search (no pagination)
2. **Ratings:** No breakdown by category (only 0-5 stars)
3. **Real-time:** No wait times, capacity, or live updates
4. **Traffic:** Current conditions only (no historical)
5. **Reviews:** ~5 most relevant per place
6. **Alternatives:** Only best route returned
7. **Booking:** No reservation/booking links
8. **Pricing:** Price level 1-4 only (no actual prices)
9. **Menu:** No menu data available
10. **Parking:** No parking availability data

---

## File Size Reference

| File | Size | Lines | Status |
|------|------|-------|--------|
| places-service.ts | - | 368 | ✅ |
| routes-service.ts | - | 222 | ✅ |
| places-aggregate-service.ts | - | 104 | ✅ |
| geocoding-service.ts | - | 169 | ✅ |
| roads-service.ts | - | 103 | ✅ |
| map-setup.ts | - | 257 | ✅ |
| **TOTAL** | **-** | **1223** | **✅** |

---

## Where to Start for UI Integration

1. **Connect search button** → Call `placesService.textSearch()`
2. **Display results** → Use `addMarker()` for each result
3. **Show info** → Create info window on marker click
4. **Add filters** → Apply in UI → Pass to search methods
5. **Show route** → Call `renderRoute()` to display

---

**Last Updated:** November 1, 2025
