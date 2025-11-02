# MapOps - Architecture & API Services

## What "Infrastructure" Means

**Infrastructure** = All the underlying code that makes everything work, but isn't visible to users.

---

## 🏗️ API Services (5 Complete Services)

These are **TypeScript classes** that wrap Google's APIs and make them easy to use. Think of them as "helpers" that do all the complex API calls for you.

### 1. **PlacesService** (`src/places-service.ts` - 368 lines)
**What it does:** Handles all place-related searches and data

**Available Methods:**
- `textSearch("café")` → Searches Google Places database
- `nearbySearch(location, radius)` → Finds places near a point
- `getPlaceDetails(placeId)` → Gets full info (hours, photos, reviews)
- `autocomplete("coff")` → Suggests "coffee shop" as you type
- `filterByWalkingDistance(places, origin, 10)` → Filters by walking time
- `filterPlaces(places, {openNow: true, minRating: 4})` → Applies filters

**Example:** You could call `placesService.textSearch("quiet café", {openNow: true})` and it would return an array of places.

**Status:** ✅ Fully implemented, ready to use

---

### 2. **RoutesService** (`src/routes-service.ts` - 222 lines)
**What it does:** Calculates routes, distances, and travel times

**Available Methods:**
- `getRoute(origin, destination)` → Gets walking/driving route
- `getDistanceMatrix([origin], [dest1, dest2, ...])` → Calculates distances to multiple places at once
- `optimizeRoute(origin, destination, waypoints)` → Finds best order for multiple stops
- `getWalkingTime(origin, destination)` → Gets just the walking time
- `renderRoute(routeData)` → Draws route line on map

**Example:** `routesService.getRoute(userLocation, cafeLocation, {travelMode: 'WALK'})` returns route data.

**Status:** ✅ Fully implemented, ready to use

---

### 3. **PlacesAggregateService** (`src/places-aggregate-service.ts` - 71 lines)
**What it does:** Advanced analytics on places

**Available Methods:**
- `searchNearby(location, radius, options)` → Advanced search with aggregation
- `countByType(location, radius, ['restaurant', 'cafe'])` → Counts how many of each type
- `getDensityInsights(locations, radius)` → Analyzes place density
- `findHighDensityAreas(bounds)` → Finds areas with most places

**Example:** Find the neighborhood with the most restaurants: `findHighDensityAreas(cityBounds, 500, ['restaurant'])`

**Status:** ✅ Fully implemented, ready to use

---

### 4. **GeocodingService** (`src/geocoding-service.ts` - 169 lines)
**What it does:** Converts between addresses and coordinates

**Available Methods:**
- `geocode("1600 Amphitheatre Parkway")` → Returns `{lat: 37.422, lng: -122.084}`
- `reverseGeocode({lat: 37.422, lng: -122.084})` → Returns `"1600 Amphitheatre Parkway"`
- `validateAddress("123 Main St")` → Checks if address is valid/standardized

**Example:** User types "near downtown" → geocode it → use coordinates for search

**Status:** ✅ Fully implemented, ready to use

---

### 5. **RoadsService** (`src/roads-service.ts` - 95 lines)
**What it does:** Works with road data and GPS tracking

**Available Methods:**
- `snapToRoads([{lat, lng}, ...])` → Moves GPS points to nearest road
- `getNearestRoads([{lat, lng}])` → Finds closest road segment
- `getSpeedLimits([placeId, ...])` → Gets speed limits for roads
- `snapRoute(routePoints)` → Cleans up GPS tracking data

**Example:** User walks with GPS → `snapRoute(gpsPoints)` cleans up the path

**Status:** ✅ Fully implemented, ready to use

---

## 🛠️ Infrastructure Components

### **Map Setup** (`src/map-setup.ts` - 265 lines)
**What it does:** Initializes Google Maps and provides utilities

**Features:**
- Creates and configures the map
- Gets user's GPS location automatically
- Adds user location marker
- Provides helper functions:
  - `addMarker(position)` → Add a marker to map
  - `clearMarkers(markers)` → Remove markers
  - `panToLocation(location)` → Move map to location
  - `getMapCenter()` → Get current map center

**Status:** ✅ Fully working

---

### **Configuration System** (`src/config.ts`)
**What it does:** Manages API keys and settings

**Features:**
- Loads API key from `.env` file
- Provides default map center, zoom levels
- Makes config available globally via `window.CONFIG`

**Status:** ✅ Fully working

---

### **Type System** (`src/types.ts`)
**What it does:** TypeScript type definitions

**Features:**
- Defines interfaces for all data structures
- Provides type safety throughout the app

**Status:** ✅ Complete

---

### **Build System**
**What it does:** Compiles TypeScript and manages dependencies

**Features:**
- `npm run build` → Compiles TypeScript to JavaScript
- `npm run watch` → Auto-recompile on file changes
- `npm start` → Build and serve

**Status:** ✅ Fully working

---

## 📊 Code Statistics

**Total Service Code:** ~962 lines across 5 services
- PlacesService: 368 lines
- RoutesService: 222 lines  
- GeocodingService: 169 lines
- PlacesAggregateService: 71 lines
- RoadsService: 95 lines

**Total Infrastructure Code:** ~600+ lines
- Map setup, configuration, types, utilities

**Total Project:** ~1,500+ lines of TypeScript

---

## 🔌 How Services Work Together

```
User types: "quiet cafés within 10 min walking"
    ↓
app.ts → parse query
    ↓
PlacesService.textSearch("quiet cafés", {openNow: true})
    ↓
RoutesService.getDistanceMatrix(userLocation, [cafe1, cafe2, ...])
    ↓
PlacesService.filterByWalkingDistance(results, userLocation, 10)
    ↓
map-setup.ts → addMarker() for each result
    ↓
RoutesService.renderRoute() → show walking route
```

**All these services are built and ready!** They just need to be **connected** in `app.ts`.

---

## 🎯 What This Means

**You have:**
- ✅ 5 complete API service classes (962 lines)
- ✅ Full map infrastructure (265 lines)
- ✅ Type system, config, build system
- ✅ All Google Maps APIs wrapped and ready

**You need:**
- ❌ Call these services from the search button
- ❌ Display results on the map
- ❌ Show info when user clicks

**Think of it like:** You built all the engines, but haven't connected them to the steering wheel yet!
