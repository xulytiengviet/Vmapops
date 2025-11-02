# Implementation Plan: AI-Driven Semantic Filters

## Overview
Enable natural language semantic queries like "quiet coffee shops", "halal restaurants with good biryani", "cafes with power outlets" without hardcoding keywords. The agent naturally extracts semantic intent, and we use LLM to analyze reviews dynamically.

## Architecture

```
User Query: "quiet coffee shops"
    ↓
Agent extracts semantic intent naturally
    ↓
search-places(query="coffee shops", semanticAttributes=["quiet"])
    ↓
PlacesService.textSearch() → Get initial results
    ↓
For top N places: PlacesService.getPlaceDetails() → Fetch reviews
    ↓
SemanticReviewAnalyzer.analyze(reviews, ["quiet"]) → LLM scores
    ↓
Rank places by semantic score + distance/rating
    ↓
Return places with metadata.semanticAttributes = {quiet: {score, count, evidence}}
    ↓
UI shows chips: "Quiet (12 mentions)"
```

## Implementation Steps

### 1. Create Semantic Review Analyzer Service
**File:** `lib/services/semantic-review-analyzer.ts`

- Uses LLM (OpenRouter) to analyze reviews against semantic attributes
- Input: `{ reviews: Review[], semanticAttributes: string[] }`
- Output: `{ [attribute]: { score: 0-1, count: number, evidence: string[] } }`
- LLM prompt: "Analyze these reviews and score how well this place matches: [attributes]. Return JSON with scores and evidence excerpts."

### 2. Enhance PlacesService.getPlaceDetails
**File:** `lib/services/places-service.ts`

- Add `fields` parameter to request: `reviews`, `editorialSummary`
- Parse reviews: `{ text, publishTime, rating }`
- Return enriched place data with reviews array

### 3. Update search-places Tool Schema
**File:** `mastra/tools/search-places.ts`

- Add `semanticAttributes?: string[]` to input schema
- Agent naturally extracts these from user query
- Example: "quiet coffee shops" → `query="coffee shops", semanticAttributes=["quiet"]`

### 4. Implement Semantic Filtering Logic
**File:** `mastra/tools/search-places.ts` (execute function)

```typescript
// Phase 1: Get initial results (existing)
const results = await service.textSearch(...);

// Phase 2: If semanticAttributes provided, enrich and score
if (semanticAttributes && semanticAttributes.length > 0) {
  // Fetch details for top 12 places
  const topPlaces = results.slice(0, 12);
  const enrichedPlaces = await Promise.all(
    topPlaces.map(async (place) => {
      const details = await service.getPlaceDetails(place.placeId, [
        'reviews',
        'editorialSummary'
      ]);
      
      // Analyze reviews with LLM
      const semanticScores = await semanticAnalyzer.analyze(
        details.reviews || [],
        semanticAttributes
      );
      
      return {
        ...place,
        metadata: {
          ...place.metadata,
          semanticAttributes: semanticScores
        }
      };
    })
  );
  
  // Rank by semantic score (weighted with distance/rating)
  enrichedPlaces.sort((a, b) => {
    const scoreA = calculateSemanticScore(a, semanticAttributes);
    const scoreB = calculateSemanticScore(b, semanticAttributes);
    return scoreB - scoreA;
  });
  
  results = enrichedPlaces;
}
```

### 5. Update Output Schema
**File:** `mastra/tools/search-places.ts`

- Add `semanticAttributes` to place metadata:
```typescript
semanticAttributes?: {
  [attribute: string]: {
    score: number; // 0-1
    count: number; // mention count
    evidence: string[]; // review excerpts
  }
}
```

### 6. Update UI to Show Semantic Chips
**File:** `app/components/ArtifactCarousel.tsx` (PlaceCard)

- Display semantic attribute chips when present
- Show count: "Quiet (12)"
- Tooltip shows evidence excerpt
- Click chip to filter results

### 7. Update Agent Instructions
**File:** `mastra/agents/cityAnalystAgent.ts`

- Guide agent to extract semantic intent naturally
- Examples:
  - "quiet coffee shops" → `semanticAttributes: ["quiet"]`
  - "halal biryani restaurant" → `semanticAttributes: ["halal", "biryani"]`
  - "cafe with power outlets" → `semanticAttributes: ["power outlets"]`

## Key Design Decisions

1. **LLM-Based Analysis**: No hardcoded keywords - LLM understands context
2. **Evidence-Based**: Always cite review excerpts, never hallucinate
3. **Caching**: Cache place details for 15min to avoid re-fetching
4. **Performance**: Limit to top 12 places for semantic analysis
5. **Fallback**: If LLM fails, return places without semantic scores

## Testing Queries

- "quiet coffee shops"
- "halal restaurants with good biryani"
- "cafes with power outlets"
- "pet-friendly restaurants"
- "restaurants with outdoor seating"
- "vegan-friendly cafes"

## Success Criteria

- ✅ Agent extracts semantic intent without hardcoding
- ✅ Places ranked by semantic relevance
- ✅ UI shows evidence-based chips
- ✅ No hallucination - only cite actual review data
- ✅ Works for any semantic attribute (not just predefined ones)

