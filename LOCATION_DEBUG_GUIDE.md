# Location Debug Guide

## Issue
Agent asks for location even though browser geolocation is enabled and location permission is granted.

## Root Cause
**Timing issue**: User sends message before browser finishes acquiring location, so `userLocation` is `null` when sent to backend.

## Changes Made

### 1. Enhanced Frontend Logging (`ChatInterface.tsx`)

**Added location acquisition logging:**
```typescript
console.log('[ChatInterface] Requesting geolocation...');
console.log('[ChatInterface] Geolocation acquired:', location);
```

**Added context sending logging:**
```typescript
console.log('[ChatInterface] Sending context to API:', context);
```

**Added visual location indicator:**
- Green badge: "📍 Location Active" when location is available
- Yellow badge: "⏳ Getting location..." while acquiring

### 2. Enhanced Backend Logging (`route.ts`)

**Added request logging:**
```typescript
console.log("[AI SDK Route] Received request with context:", JSON.stringify(context, null, 2));
```

**Added RuntimeContext population logging:**
```typescript
✅ [AI SDK Route] User location SET in RuntimeContext: {...}
⚠️ [AI SDK Route] No userLocation in context - tools will not have location fallback!
```

## How to Test

### Step 1: Reload the page and watch console

You should see:
```
[ChatInterface] Requesting geolocation...
[ChatInterface] Geolocation acquired: { lat: X, lng: Y }
```

### Step 2: Send a message "Find coffee near me"

**Frontend console** should show:
```
[ChatInterface] Sending context to API: {
  userLocation: { lat: X, lng: Y },
  mapCenter: { lat: X, lng: Y },
  mapZoom: 13
}
```

**Backend console** (terminal running `npm run dev`) should show:
```
[AI SDK Route] Received request with context: {
  "userLocation": { "lat": X, "lng": Y },
  ...
}
✅ [AI SDK Route] User location SET in RuntimeContext: { lat: X, lng: Y }
```

**Tool console** (if tool uses RuntimeContext) should show:
```
[search-places] Using location from RuntimeContext: { lat: X, lng: Y }
```

## What to Look For

### ✅ Good Flow
```
1. [ChatInterface] Geolocation acquired: { lat: X, lng: Y }
2. [ChatInterface] Sending context to API: { userLocation: { lat: X, lng: Y } }
3. ✅ [AI SDK Route] User location SET in RuntimeContext
4. [search-places] Using location from RuntimeContext
5. Agent finds coffee shops successfully
```

### ❌ Bad Flow (Current Issue)
```
1. [ChatInterface] Requesting geolocation...
2. User types and sends message BEFORE location acquired
3. [ChatInterface] Sending context to API: { userLocation: null }
4. ⚠️ [AI SDK Route] No userLocation in context
5. Agent asks for location
6. [ChatInterface] Geolocation acquired (TOO LATE)
```

## Solutions

### Option 1: Wait for Location Before Allowing Messages

Disable the send button until location is acquired:

```typescript
<button
    type="submit"
    disabled={status === 'streaming' || status === 'submitted' || !inputValue.trim() || !userLocation}
>
```

### Option 2: Show Warning if No Location

Show a message if user tries to send before location:

```typescript
{!userLocation && (
    <div className="text-xs text-yellow-600">
        ⏳ Waiting for location... You can still send messages but location-based features won't work.
    </div>
)}
```

### Option 3: Use Last Known Location

Store location in localStorage and use as fallback:

```typescript
useEffect(() => {
    if (userLocation) {
        localStorage.setItem('lastKnownLocation', JSON.stringify(userLocation));
    }
}, [userLocation]);

// On mount, try to use last known location
const lastKnown = localStorage.getItem('lastKnownLocation');
if (lastKnown) {
    setUserLocation(JSON.parse(lastKnown));
}
```

## Next Steps

1. **Reload the page** and open both browser console and terminal
2. **Wait for the green "📍 Location Active" badge** to appear
3. **Send your message** "Find coffee near me"
4. **Check the logs** to see if location is being sent and received properly

**Expected Outcome:**
- Frontend: `userLocation: { lat: X, lng: Y }`
- Backend: `✅ User location SET in RuntimeContext`
- Tool: `[search-places] Using location from RuntimeContext`
- Agent: Successfully finds coffee shops

If you still see the agent asking for location after waiting for the green badge, please share:
1. Frontend console logs (browser)
2. Backend console logs (terminal)
3. Screenshot of the badge status when you sent the message
