# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MapOps** is a conversational city analyst application built with TypeScript and Google Maps APIs. It provides an interactive map interface with natural language place search, routing, and location-based analytics.

## Common Commands

```bash
# Build TypeScript to JavaScript (outputs to dist/)
npm run build

# Watch TypeScript files and rebuild on changes
npm run watch

# Watch TypeScript + start local dev server on port 8000
npm run dev

# Build and serve (recommended for testing)
npm run serve
# or
npm start

# Install dependencies
npm install
```

## Architecture Overview

### Service-Based Architecture Pattern

MapOps uses a **browser-based, service-oriented architecture** with a clear separation of concerns:

```
User Interaction (HTML/UI)
         ↓
    app.ts (Controller/Orchestrator)
         ↓
  ┌──────┴──────┬─────────┬──────────┬──────────────┐
  │             │         │          │              │
PlacesService  Routes    Geocoding  Roads        PlacesAggregate
Service        Service   Service    Service      Service
  │             │         │          │              │
  └──────┬──────┴─────────┴──────────┴──────────────┘
         ↓
   Google Maps APIs
```

### Core Files & Their Roles

**Entry Point & Controller:**
- **`src/app.ts`** - Main application logic, event handlers, search orchestration. Waits for DOM and Google Maps API to be ready, then initializes event listeners.

**Map & Service Initialization:**
- **`src/map-setup.ts`** - Google Maps initialization, core map operations (panTo, zoom, markers). Instantiates all 5 services and exposes them globally via `window.mapOps`.

**Service Layer (5 specialized services):**
1. **`src/places-service.ts`** - Places API wrapper: text search, nearby search, place details, autocomplete, walking distance filtering, advanced filtering (open now, rating, price level)
2. **`src/routes-service.ts`** - Routing & navigation: get routes, distance matrix, route optimization, walking time calculation, route rendering
3. **`src/geocoding-service.ts`** - Address/location conversion: geocode addresses to coordinates, reverse geocode, validate addresses
4. **`src/roads-service.ts`** - Road data & GPS handling: snap to roads, find nearest roads, get speed limits
5. **`src/places-aggregate-service.ts`** - Place analytics: search nearby with aggregation, count by type, density insights, find high-density areas

**Configuration & Types:**
- **`src/config.ts`** - Application settings (API key, map defaults, debug mode)
- **`src/types.ts`** - TypeScript interfaces for all services and domain objects

### Data Flow Pattern

When user performs a search:
1. `app.ts` receives search input → calls `handleSearch()`
2. `PlacesService.textSearch()` queries Google Places API
3. Results optionally filtered by `PlacesService.filterByWalkingDistance()` using Routes API
4. Each result gets a marker via `map-setup.addMarker()`
5. Results displayed on map and in UI

### Key Architectural Characteristics

- **Global Service Access**: All services exported via `window.mapOps` (Service Locator pattern)
- **Dual API Support**: Modern APIs with legacy fallbacks (e.g., Places API v1 with Places Library fallback)
- **Promise/Async-Based**: All service methods return Promises
- **Type Safety**: Full TypeScript with interfaces for all API parameters
- **Strict Separation**: Each service handles one domain; no cross-service dependencies

## Integration Status

**✅ Implemented (~90%):**
- All 5 service classes fully implemented with multiple methods each
- Map initialization and core operations
- Configuration system
- Type definitions

**❌ Not Connected (~10%):**
- Search input → Places API integration (placeholder alert only)
- Results display on map (functions exist, not called)
- Info windows/detail popups
- Route visualization
- Loading states and error UI

See `PROJECT_STATUS.md` for detailed integration checklist and quick-start examples.

## Build Configuration

- **Target**: ES2020 with DOM libraries
- **Output**: `dist/` directory (generated)
- **Source Maps**: Enabled for debugging
- **Module System**: None (browser scripts, globals)
- **Strict Mode**: Off (tsconfig.json, `strict: false`)

## TypeScript Notes

- Strict mode disabled but some checks enabled (noFallthroughCasesInSwitch)
- Google Maps types available via `@types/google.maps`
- ES2020 target for modern JavaScript features
- All compiled files output to `dist/` which is loaded by `index.html`

## Environment Setup

- `.env` file contains `VITE_GOOGLE_MAPS_API_KEY` (read by config.ts)
- `config.js` is gitignored; use `config.example.js` as template
- API key should be restricted to required Google Maps APIs in Cloud Console

## Testing & Debugging

- TypeScript source maps enabled (`sourceMap: true`)
- Debug flag in `config.ts` can be toggled for verbose logging
- All services log errors to console with context
- Browser DevTools can access all services via `window.mapOps.{serviceName}`

Example REPL usage in browser console:
```javascript
// Test places search
const results = await window.mapOps.placesService.textSearch('coffee', {
  location: window.mapOps.userLocation,
  radius: 1000
});

// Check service instances
console.log(window.mapOps); // See all available services
```

## Important Notes

1. **API Key Required**: Application won't function without valid Google Maps API key in `.env`
2. **Browser Geolocation**: User must grant location permission for full functionality
3. **Service Instantiation**: Services are created in `map-setup.ts` after Google Maps library loads
4. **Global Scope**: All services intentionally exposed globally; not using module bundler
5. **TypeScript Compilation**: Must run `npm run build` before testing in browser
