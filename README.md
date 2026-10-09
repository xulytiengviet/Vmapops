# Vmapops · WebGIS tiếng Việt

Giao diện mới: bản đồ mở, quản lý lớp GeoJSON, đo khoảng cách và cài đặt API riêng.
**[Hướng dẫn WebGIS và kết nối API](webgis/README.md)** · Long Ngo thiết kế · MIT 2026.

Chạy ngay: `python3 -m http.server 8000` rồi mở `http://localhost:8000`.
Bản Google Maps trước đây được giữ ở `legacy.html`; mã nguồn và tài liệu gốc bên dưới.

---

# MapOps - Conversational City Analyst

A map-based AI agent that understands natural language and acts on maps to help people explore a city, decide where to go, and discover places tailored to their preferences.

**Built in 18 hours during the YC Agent Jam '25 Hackathon** (November 1-2, 2025, San Francisco, CA)

## Demo

<div align="center">
  <a href="https://youtu.be/LCXSAKloxjA">
    <img src="https://img.youtube.com/vi/LCXSAKloxjA/maxresdefault.jpg" alt="MapOps Demo" style="width:100%; max-width:800px;">
  </a>
  <p><em>Click to watch the full demo on YouTube</em></p>
</div>

## Features

- Interactive Google Maps view
- Natural language query processing
- Place search and filtering
- Walking distance calculations
- Real-time location detection

## Setup Instructions

### 1. Get Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Maps JavaScript API
   - Places API (New)
   - Routes API
   - Distance Matrix API
   - Geocoding API
4. Create an API key:
   - Navigate to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Restrict the key to the APIs you're using (recommended)

5. Enable the following APIs:
   - Maps JavaScript API
   - Places API (New)
   - Places Aggregate API
   - Routes API
   - Distance Matrix API (or use Routes API)
   - Geocoding API
   - Roads API
   - Route Optimization API

### 2. Configure API Key

1. Copy the example config file:
   ```bash
   cp config.example.js config.js
   ```

2. Open `config.js` and replace `YOUR_API_KEY_HERE` with your actual API key:
   ```javascript
   API_KEY: 'YOUR_ACTUAL_API_KEY',
   ```

### 3. Install Dependencies

```bash
npm install
```

### 4. Build TypeScript

```bash
# Build once
npm run build

# Or watch for changes during development
npm run watch
```

### 5. Run the Application

```bash
# Build and serve (recommended - automatically builds first)
npm start

# Or manually: build then serve
npm run build
python3 -m http.server 8000
# Then open http://localhost:8000
```

## Project Structure

```
yc_jam/
├── index.html                      # Main HTML file with map container
├── tsconfig.json                   # TypeScript configuration
├── package.json                    # Dependencies and scripts
├── config.js                       # API key configuration (gitignored)
├── config.example.js               # Example config file
├── src/
│   ├── types.ts                    # TypeScript type definitions
│   ├── config.ts                   # Configuration (TypeScript)
│   ├── map-setup.ts                # Google Maps initialization
│   ├── app.ts                      # Main application logic
│   ├── places-service.ts           # Places API integration
│   ├── routes-service.ts           # Routes API integration
│   ├── places-aggregate-service.ts # Places Aggregate API
│   ├── geocoding-service.ts        # Geocoding API
│   └── roads-service.ts            # Roads API
├── dist/                           # Compiled JavaScript (generated)
└── README.md
```

**Note:** This project uses TypeScript. Source files are in `src/`, and compiled JavaScript is output to `dist/`.

## Complete API Integration

The project now includes comprehensive integration with all Google Maps Platform APIs:

### 1. Places API (`src/places-service.js`)

- ✅ **Text Search** - Natural language place search (new Places API)
- ✅ **Nearby Search** - Find places near a location
- ✅ **Place Details** - Get detailed information about places
- ✅ **Place Autocomplete** - Autocomplete suggestions
- ✅ **Walking Distance Filter** - Filter places by walking time
- ✅ **Advanced Filtering** - Filter by open status, rating, price level

### 2. Routes API (`src/routes-service.js`)

- ✅ **Get Routes** - Calculate routes between locations
- ✅ **Distance Matrix** - Calculate distances and times for multiple points
- ✅ **Route Optimization** - Optimize multi-stop routes
- ✅ **Walking Time** - Get walking time between points
- ✅ **Route Rendering** - Display routes on the map

### 3. Places Aggregate API (`src/places-aggregate-service.js`)

- ✅ **Search Nearby** - Advanced place search with aggregation
- ✅ **Count by Type** - Count places by type in an area
- ✅ **Density Insights** - Analyze place density
- ✅ **High Density Areas** - Find areas with most places

### 4. Geocoding API (`src/geocoding-service.js`)

- ✅ **Geocode** - Convert addresses to coordinates
- ✅ **Reverse Geocode** - Convert coordinates to addresses
- ✅ **Address Validation** - Validate and standardize addresses

### 5. Roads API (`src/roads-service.js`)

- ✅ **Snap to Roads** - Snap GPS points to nearest roads
- ✅ **Nearest Roads** - Find nearest road segments
- ✅ **Speed Limits** - Get speed limit information
- ✅ **Route Snapping** - Clean up GPS tracking data

### Usage Examples:

```javascript
// Places Service
const placesService = window.mapOps.placesService;
const results = await placesService.textSearch('quiet cafés', {
    location: window.mapOps.userLocation,
    openNow: true
});

// Routes Service
const routesService = window.mapOps.routesService;
const route = await routesService.getRoute(
    origin, 
    destination, 
    { travelMode: 'WALK' }
);

// Places Aggregate Service
const aggregateService = window.mapOps.placesAggregateService;
const density = await aggregateService.countByType(
    location, 
    1000, 
    ['restaurant', 'cafe']
);

// Geocoding Service
const geocodingService = window.mapOps.geocodingService;
const location = await geocodingService.geocode('1600 Amphitheatre Parkway');

// Roads Service
const roadsService = window.mapOps.roadsService;
const snapped = await roadsService.snapToRoads(gpsPoints);
```

## Next Steps

- [x] Basic map setup
- [x] Places API integration
- [x] Routes API integration
- [x] Places Aggregate API integration
- [x] Geocoding API integration
- [x] Roads API integration
- [ ] Implement NLP query parsing
- [ ] Connect search UI to all APIs
- [ ] Add result markers and info windows
- [ ] Implement route visualization
- [ ] Enhance UI with search results display

## API Documentation

- [Maps JavaScript API](https://developers.google.com/maps/documentation/javascript)
- [Places API](https://developers.google.com/maps/documentation/places)
- [Places Aggregate API](https://developers.google.com/maps/documentation/places-aggregate)
- [Routes API](https://developers.google.com/maps/documentation/routes)
- [Geocoding API](https://developers.google.com/maps/documentation/geocoding)
- [Roads API](https://developers.google.com/maps/documentation/roads)

## License

MIT
