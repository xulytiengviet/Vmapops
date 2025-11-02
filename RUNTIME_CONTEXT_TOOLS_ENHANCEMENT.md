# RuntimeContext Integration for Mastra Tools

## Summary

All 5 Mastra tools have been enhanced to properly access `RuntimeContext` for dynamic behavior, following Mastra's official documentation patterns.

## What Was Changed

### Tools Updated

1. ✅ **search-places.ts** - Location fallback from RuntimeContext
2. ✅ **get-directions.ts** - Origin fallback from RuntimeContext  
3. ✅ **calculate-distance-matrix.ts** - Origins fallback from RuntimeContext
4. ✅ **geocode.ts** - RuntimeContext awareness for future enhancements
5. ✅ **get-place-details.ts** - RuntimeContext awareness for user preferences

## Implementation Pattern

### Before (Agent passes parameters explicitly)
```typescript
execute: async ({ context, writer }) => {
    // Tool only uses explicit parameters
    const location = context.location;
    if (!location) {
        return { success: false, error: "Location required" };
    }
}
```

### After (Tool accesses RuntimeContext with fallback)
```typescript
execute: async ({ context, runtimeContext, writer }) => {
    // Try RuntimeContext as fallback
    const userLocation = runtimeContext?.get("userLocation") as CityAnalystRuntimeContext["userLocation"];
    
    // Use tool parameter OR fallback to RuntimeContext
    const searchLocation = context.location || userLocation;
    
    if (!searchLocation) {
        return { success: false, error: "Location required" };
    }
    
    // Log RuntimeContext usage for debugging
    if (!context.location && userLocation) {
        console.log("[tool] Using location from RuntimeContext:", userLocation);
    }
}
```

## Benefits

### 1. Smarter Fallback Behavior

**User says:** "Find coffee near me"

**Agent behavior:**
- Agent doesn't need to explicitly pass location parameter
- Tool automatically uses user location from RuntimeContext

**Code flow:**
```
User: "coffee near me"
  ↓
Agent decides: "Use search-places tool"
  ↓
Tool gets location from RuntimeContext
  ↓
Search executes with user's current location
```

### 2. Cleaner Agent Logic

Agent instructions can be simplified - less need to extract location and pass it explicitly:

```typescript
// Agent doesn't need to manually handle location extraction
instructions: async ({ runtimeContext }) => {
    const userLocation = runtimeContext?.get("userLocation");
    return `User location: ${userLocation?.lat}, ${userLocation?.lng}
            Tools will automatically use this location when needed.`;
}
```

### 3. Future Extensibility

Easy to add tier-based features:

```typescript
export type ChatRuntimeContext = {
    userLocation?: { lat: number; lng: number };
    mapCenter?: { lat: number; lng: number };
    mapZoom?: number;
    userTier?: 'free' | 'pro' | 'enterprise';  // Add this
};

// In tools:
const userTier = runtimeContext?.get("userTier");
const maxResults = userTier === 'enterprise' ? 50 : 
                  userTier === 'pro' ? 20 : 10;
```

## Tool-Specific Changes

### 1. search-places.ts

**Enhancement:** Location parameter now optional, falls back to RuntimeContext

```typescript
// Schema: location is now optional
location: z.object({
    lat: z.number(),
    lng: z.number(),
}).optional()

// Logic: Use tool param OR RuntimeContext
const userLocation = runtimeContext?.get("userLocation");
const searchLocation = context.location || userLocation;
```

**Use case:**
- User: "Find coffee shops near me"
- Tool uses RuntimeContext location automatically
- No need for agent to extract and pass location

### 2. get-directions.ts

**Enhancement:** Origin parameter now optional, falls back to RuntimeContext

```typescript
// Schema: origin is now optional
origin: z.object({
    lat: z.number(),
    lng: z.number(),
}).optional().describe("Starting location (defaults to user's current location)")

// Logic: Use tool param OR RuntimeContext
const userLocation = runtimeContext?.get("userLocation");
const origin = context.origin || userLocation;
```

**Use case:**
- User: "Get directions to Starbucks"
- Tool uses RuntimeContext for origin (user's location)
- Only destination needs to be provided

### 3. calculate-distance-matrix.ts

**Enhancement:** Origins can default to user location from RuntimeContext

```typescript
// Logic: If origins array is empty, use RuntimeContext
const userLocation = runtimeContext?.get("userLocation");
const origins = context.origins.length > 0 ? context.origins : (userLocation ? [userLocation] : []);
```

**Use case:**
- User: "Which of these 3 restaurants is closest?"
- Tool uses RuntimeContext for origin (user's location)
- Compares distances from user to each restaurant

### 4. geocode.ts

**Enhancement:** RuntimeContext awareness for potential future features

```typescript
// Currently just logs RuntimeContext availability
const userLocation = runtimeContext?.get("userLocation");
if (userLocation) {
    console.log("[geocode] User location available:", userLocation);
}
```

**Future use cases:**
- Bias geocoding results toward user's region
- Use user's country for address formatting

### 5. get-place-details.ts

**Enhancement:** RuntimeContext awareness for user preferences

```typescript
// Currently just logs RuntimeContext availability
const userLocation = runtimeContext?.get("userLocation");
if (userLocation) {
    console.log("[get-place-details] User location available:", userLocation);
}
```

**Future use cases:**
- Show distance from user to place
- Customize details based on user tier (enterprise gets more reviews, etc.)

## Type Safety

All tools now import the RuntimeContext type:

```typescript
import type { CityAnalystRuntimeContext } from "../agents/cityAnalystAgent";

// Type-safe access
const userLocation = runtimeContext?.get("userLocation") as CityAnalystRuntimeContext["userLocation"];
```

## Debugging

All tools log when they use RuntimeContext values:

```typescript
if (!context.location && userLocation) {
    console.log("[search-places] Using location from RuntimeContext:", userLocation);
}
```

This makes it easy to see when fallback behavior is triggered.

## Backward Compatibility

✅ **Fully backward compatible**

Tools still accept explicit parameters - RuntimeContext is a **fallback**, not a replacement:

```typescript
// Both work:
await searchPlaces.execute({
    context: { query: "coffee", location: { lat: 40.7, lng: -74.0 } } // Explicit
});

await searchPlaces.execute({
    context: { query: "coffee" }, // Uses RuntimeContext for location
    runtimeContext: runtimeContextWithLocation
});
```

## Comparison with Mastra Docs

### From Mastra Documentation
```typescript
export const weatherTool = createTool({
  id: "weather-tool",
  execute: async ({ context, runtimeContext }) => {
    const userTier = runtimeContext.get("user-tier");
    if (userTier === "enterprise") {
      // Premium features
    }
  },
});
```

### Our Implementation
```typescript
export const searchPlaces = createTool({
  id: "search-places",
  execute: async ({ context, runtimeContext, writer }) => {
    const userLocation = runtimeContext?.get("userLocation");
    const searchLocation = context.location || userLocation;
    // Use searchLocation for search
  },
});
```

✅ **Pattern matches Mastra documentation exactly**

## Next Steps (Optional Future Enhancements)

### 1. User Tier-Based Limits
```typescript
export type ChatRuntimeContext = {
    userLocation?: { lat: number; lng: number };
    userTier?: 'free' | 'pro' | 'enterprise';
};

// In search-places:
const userTier = runtimeContext?.get("userTier");
const maxResults = context.maxResults || (
    userTier === 'enterprise' ? 50 :
    userTier === 'pro' ? 20 : 10
);
```

### 2. User Preferences
```typescript
export type ChatRuntimeContext = {
    userLocation?: { lat: number; lng: number };
    preferences?: {
        distanceUnit: 'miles' | 'km';
        language: 'en' | 'es' | 'fr';
    };
};

// In tools:
const preferences = runtimeContext?.get("preferences");
const distance = formatDistance(meters, preferences?.distanceUnit);
```

### 3. A/B Testing Flags
```typescript
export type ChatRuntimeContext = {
    userLocation?: { lat: number; lng: number };
    features?: {
        useNewSearchAlgorithm: boolean;
        showEnhancedDetails: boolean;
    };
};
```

## Testing

### Test RuntimeContext Access
```typescript
const runtimeContext = new RuntimeContext<CityAnalystRuntimeContext>();
runtimeContext.set("userLocation", { lat: 40.7128, lng: -74.0060 });

// Test search-places with RuntimeContext
const result = await searchPlaces.execute({
    context: { query: "coffee" },  // No location provided
    runtimeContext,
    writer: mockWriter
});

// Should use location from RuntimeContext
expect(result.success).toBe(true);
```

## Summary

✅ All 5 tools now properly access RuntimeContext  
✅ Follows Mastra documentation patterns exactly  
✅ Backward compatible - explicit parameters still work  
✅ Type-safe with proper TypeScript types  
✅ Debug logging for RuntimeContext usage  
✅ Future-ready for tier-based features and preferences  

This enhancement makes tools more flexible and intelligent, while maintaining clean separation of concerns.
