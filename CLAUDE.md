# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MapOps** is a conversational city analyst application built with Next.js 15, Mastra AI agents, and Google Maps APIs. It provides an interactive map interface with natural language chat, enabling users to search places, get directions, plan trips, and analyze city data through conversation.

## Common Commands

```bash
# Next.js Frontend Development (primary)
cd nextjs-frontend
npm install              # Install dependencies
npm run dev             # Start dev server on port 3000 with hot reload
npm run build           # Build for production
npm start               # Start production server
npm run lint            # Run ESLint

# Legacy TypeScript Project (root directory)
npm run build           # Compile TypeScript to dist/
npm run watch           # Watch mode with auto-rebuild
npm run serve           # Build + serve on port 8000
```

## Architecture Overview

### Tech Stack
- **Frontend**: Next.js 15.0.0, React 19.0.0, TypeScript 5.3.3 (strict mode)
- **AI Framework**: Mastra 0.23.3 + AI SDK 5.0.86 with OpenRouter LLM
- **State**: Zustand 5.0.8 for map state management
- **Maps**: @react-google-maps/api 2.19.0
- **Styling**: Tailwind CSS 3.4.0

### High-Level Architecture

```
User Interface (React Components)
         ↓
    Chat Input → API Route (/api/chat)
         ↓
    Mastra Agent (cityAnalystAgent)
         ↓
    Tool Execution (10+ map tools)
         ↓
    Stream Custom Data Parts
         ↓
    Update Map State (Zustand)
         ↓
    Map & UI Updates
```

### Core Components & Files

**Frontend Entry & Layout:**
- `nextjs-frontend/app/page.tsx` - Main page with two-column layout (map + chat)
- `nextjs-frontend/app/layout.tsx` - Root layout with providers

**Key React Components:**
- `ChatInterface.tsx` - Message handling, streaming responses, integrates with Zustand
- `MapView.tsx` - Google Map display, processes map commands from agent
- `ArtifactCarousel.tsx` - Displays created routes, trips, and place collections
- `Navbar.tsx`, `UserProfilePanel.tsx` - UI chrome and user preferences

**State Management:**
- `nextjs-frontend/app/hooks/useMapState.ts` - Zustand store for:
  - Markers (place/location/route markers)
  - Routes (polylines with metadata)
  - Viewport (center, zoom, bounds)
  - Artifacts (saved routes, trips, places)
- `nextjs-frontend/app/hooks/useUserProfile.ts` - User preferences store

**API & Streaming:**
- `nextjs-frontend/app/api/chat/route.ts` - Server-side route that:
  1. Creates RuntimeContext with user location and map state
  2. Executes cityAnalystAgent with context
  3. Streams responses using AI SDK's DefaultChatTransport
  4. Returns custom data parts with map commands

**Agent System (Mastra):**
- `nextjs-frontend/mastra/index.ts` - Mastra configuration
- `nextjs-frontend/mastra/agents/cityAnalystAgent.ts` - Main agent with:
  - OpenRouter LLM integration
  - Extensive system instructions for city/place operations
  - Access to all map tools
  - RuntimeContext awareness

**Tools** (`nextjs-frontend/mastra/tools/`):
1. `search-places.ts` - Google Places search (text/nearby)
2. `get-directions.ts` - Multi-modal routing with polylines
3. `navigate-to-place.ts` - Pan map and add markers
4. `geocode.ts` - Address/coordinate conversion
5. `trip-plan.ts` - Complex trip planning
6. `map-control.ts` - Zoom/pan operations
7. Plus transit-specific and utility tools

**Services** (`nextjs-frontend/lib/services/`):
- Google API wrappers for Places, Routes, Geocoding
- Each service handles one API domain
- Shared by tools for actual API calls

### Data Flow Pattern

1. **User sends message** → ChatInterface captures input
2. **API route** receives message with RuntimeContext (location, map state)
3. **Mastra agent** processes with LLM, decides which tools to use
4. **Tools execute** Google Maps API calls, return results
5. **Tools stream** custom data parts: `{ type: 'mapCommands', mapCommands: [...] }`
6. **ChatInterface** receives stream, dispatches map commands to Zustand
7. **MapView** reacts to state changes, updates markers/routes/viewport
8. **UI components** display results and artifacts

### Key Architectural Patterns

**RuntimeContext Pattern**: Pass user location and map state from client to agent:
```typescript
const runtimeContext = {
  user: { location: { lat, lng } },
  mapState: { center, zoom, markers, routes }
};
```

**Custom Data Streaming**: Tools send map commands via custom parts:
```typescript
await writer.custom({
  type: 'mapCommands',
  mapCommands: [
    { type: 'addMarker', data: {...} },
    { type: 'drawRoute', data: {...} }
  ]
});
```

**Zustand Actions**: Map commands dispatch to specific store actions:
- `addMarker`, `clearMarkers`, `addRoute`, `clearRoutes`
- `setViewport`, `fitBounds`, `addArtifact`

**Client Component Pattern**: All interactive components use `'use client'` directive

## Development Patterns

### Adding New Map Tools
1. Create tool in `nextjs-frontend/mastra/tools/`
2. Define schema with clear parameters
3. Use services from `lib/services/` for API calls
4. Stream results via `writer.custom()` with mapCommands
5. Register in `nextjs-frontend/mastra/tools/index.ts`

### Modifying Agent Behavior
- Edit system instructions in `nextjs-frontend/mastra/agents/cityAnalystAgent.ts`
- Agent has access to RuntimeContext for location awareness
- Can access all registered tools automatically

### Adding UI Components
- Create in `nextjs-frontend/app/components/`
- Use `'use client'` for interactivity
- Access map state via `useMapState()` hook
- Dispatch actions to update map

### Handling Map Commands
- Map commands defined in `ChatInterface.tsx`
- Each command type maps to a Zustand action
- MapView subscribes to state changes and updates display

## Environment Setup

Required environment variables in `nextjs-frontend/.env.local`:
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-maps-key
OPENROUTER_API_KEY=your-openrouter-key
```

Google Maps API key needs these APIs enabled:
- Maps JavaScript API
- Places API (New)
- Routes API
- Geocoding API
- Distance Matrix API

## Testing & Debugging

- Development server includes hot reload and error overlay
- Zustand DevTools integration for state debugging
- Map state accessible via `useMapState.getState()` in console
- Agent logs visible in terminal during `npm run dev`
- Custom data parts logged in ChatInterface for debugging

## Current Implementation Status

**Fully Implemented:**
- Place search (text and nearby)
- Multi-modal directions (driving, walking, transit)
- Real-time streaming with map updates
- Marker and route visualization
- Geocoding and reverse geocoding
- Distance matrix calculations
- Map viewport controls
- Artifact storage for routes/trips

**In Development:**
- Complex trip optimization
- User profile preferences integration
- Advanced transit options with real-time data
- Historical artifact management