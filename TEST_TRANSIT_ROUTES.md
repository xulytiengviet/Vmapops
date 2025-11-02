# Transit Route Testing Guide

## Overview

The `test_route.ts` file contains comprehensive tests for the transit route functionality in `routes-service.ts`.

## How to Run Tests

### Method 1: Browser Console (Recommended)

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Open your application** in a browser (e.g., `http://localhost:8000`)

3. **Wait for the map to initialize** (check console for "Map initialized successfully")

4. **Load the test file** in the browser console:
   - Option A: Copy and paste the compiled JavaScript from `dist/test_route.js` into the console
   - Option B: Add a script tag to `index.html` that loads the compiled test file

5. **Run the tests**:
   ```javascript
   // Run all tests
   runAllTransitTests();

   // Or run individual tests
   testTransitRoute();
   testNextTransitDeparture();
   testTransitViaGetRoute();
   ```

### Method 2: Add to HTML

Add this script tag to your `index.html` (after other scripts):

```html
<script src="dist/test_route.js"></script>
```

Then run tests from console: `runAllTransitTests()`

## Test Functions

### `testTransitRoute()`
Tests basic transit route functionality:
- Gets transit route with BUS and SUBWAY preferences
- Extracts transit details
- Logs all transit information

### `testNextTransitDeparture()`
Tests the convenience method for finding next transit:
- Gets next available bus departure
- Returns departure/arrival times

### `testTransitViaGetRoute()`
Tests transit routing via the main `getRoute()` method:
- Verifies that `travelMode: 'TRANSIT'` routes correctly
- Tests with TRAIN and SUBWAY preferences

### `runAllTransitTests()`
Runs all three tests sequentially.

## Test Coordinates

The tests use San Francisco coordinates (good transit coverage):
- **Origin**: Union Square (37.7749, -122.4194)
- **Destination**: Nearby location (37.7849, -122.4094)

You can modify these coordinates in `test_route.ts` to test different locations.

## Expected Output

When tests run successfully, you should see:

```
🧪 Running All Transit Route Tests...

🚌 Testing Transit Route...
Origin: { lat: 37.7749, lng: -122.4194 }
Destination: { lat: 37.7849, lng: -122.4094 }
✅ Transit route retrieved: {...}
Routes found: 2
✅ Transit steps extracted: 2

📍 Transit Step 1:
  Departure Stop: Powell St Station
  Arrival Stop: Montgomery St Station
  Departure Time: 14:30
  Arrival Time: 14:35
  Transit Line: Muni Metro
  Vehicle Type: SUBWAY
  Headsign: Balboa Park
  Stop Count: 5

🚌 Testing Next Transit Departure...
✅ Next transit departure: {...}
  Departure Time: 14:30
  Arrival Time: 14:35
  Transit Line: Muni Metro

🚌 Testing Transit via getRoute() method...
✅ Transit route via getRoute(): {...}

✅ All transit tests completed successfully!
```

## Troubleshooting

### Error: "RoutesService not initialized"
- Make sure the map has fully loaded
- Check that `window.mapOps.routesService` exists
- Verify the Routes API key is configured

### Error: "No transit options found"
- Try different coordinates (areas with good transit coverage)
- Check if transit is available between your test locations
- Verify the Routes API is enabled in Google Cloud Console

### Error: "Transit Routes API error"
- Check your API key has Routes API enabled
- Verify the API key has transit permissions
- Check network tab for detailed error messages

## Notes

- Tests require an active internet connection
- Tests use real API calls (counts toward API quota)
- Results depend on transit availability in your test area
- Some areas may not have transit options available

