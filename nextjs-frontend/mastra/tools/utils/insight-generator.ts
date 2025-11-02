/**
 * Insight Generator
 * Creates human-friendly insights from search results
 */

export interface InsightObject {
  summary: string;
  highlights: string[];
  suggestions: string[];
  warnings?: string[];
}

/**
 * Generate insights from place search results
 */
export function generatePlaceInsights(
  results: any[],
  searchType: string
): InsightObject {
  const highlights: string[] = [];
  const suggestions: string[] = [];
  const warnings: string[] = [];

  // Enhanced Summary with travel info
  let summary = `Found ${results.length} ${searchType} results`;

  if (results.length === 0) {
    summary = `No ${searchType} found`;
    suggestions.push(`Try increasing the search radius`);
    suggestions.push(`Try a broader search term`);
    return { summary, highlights, suggestions, warnings };
  }

  // Calculate statistics including travel time
  const withRatings = results.filter((p) => p.rating);
  const avgRating =
    withRatings.length > 0
      ? withRatings.reduce((sum: number, p: any) => sum + p.rating, 0) /
        withRatings.length
      : undefined;

  // Add travel time and distance insights
  const withDistance = results.filter((p) => p.distanceMeters);
  if (withDistance.length > 0) {
    const nearest = withDistance.sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
    const nearestDist = nearest.distanceMeters < 1000
      ? `${Math.round(nearest.distanceMeters)}m`
      : `${(nearest.distanceMeters / 1000).toFixed(1)}km`;

    const travelTime = nearest.travelTimeMinutes || nearest.walkingTimeMinutes;
    const travelMode = nearest.travelMode || 'WALK';

    if (travelTime) {
      highlights.push(`Nearest: ${nearest.name} (${nearestDist}, ${travelTime} min ${travelMode.toLowerCase()})`);
    } else {
      highlights.push(`Nearest: ${nearest.name} (${nearestDist})`);
    }

    // Add average travel time if available
    const withTravelTime = results.filter(p => p.travelTimeMinutes || p.walkingTimeMinutes);
    if (withTravelTime.length > 0) {
      const avgTravelTime = Math.round(
        withTravelTime.reduce((sum, p) => sum + (p.travelTimeMinutes || p.walkingTimeMinutes || 0), 0)
        / withTravelTime.length
      );
      highlights.push(`Average travel time: ${avgTravelTime} min`);
    }

    // Summary with distance range
    if (withDistance.length === results.length) {
      const farthest = withDistance[withDistance.length - 1];
      const farthestDist = farthest.distanceMeters < 1000
        ? `${Math.round(farthest.distanceMeters)}m`
        : `${(farthest.distanceMeters / 1000).toFixed(1)}km`;
      summary += ` within ${nearestDist}-${farthestDist}`;
    }
  }

  // Highlights
  const bestRated = withRatings.sort((a: any, b: any) => b.rating - a.rating)[0];
  if (bestRated) {
    highlights.push(`Highest rated: ${bestRated.name} (${bestRated.rating}⭐)`);
  }

  if (avgRating) {
    highlights.push(`Average rating: ${avgRating.toFixed(1)}⭐`);
  }

  const openNow = results.filter((p: any) => p.openNow).length;
  if (openNow > 0 && openNow < results.length) {
    highlights.push(`${openNow} currently open`);
  } else if (openNow === results.length) {
    highlights.push(`All currently open`);
  }

  // Semantic/Vibe insights
  const withSemantics = results.filter(p => p.semanticAttributes);
  if (withSemantics.length > 0) {
    const topVibeMatch = withSemantics[0];
    if (topVibeMatch.semanticAttributes) {
      const vibeAttrs = Object.keys(topVibeMatch.semanticAttributes);
      const bestVibes = vibeAttrs
        .filter(attr => topVibeMatch.semanticAttributes[attr].score > 0.7)
        .slice(0, 2);

      if (bestVibes.length > 0) {
        highlights.push(`Best vibe match: ${topVibeMatch.name} (${bestVibes.join(', ')})`);
      }
    }
  }

  // Suggestions based on results
  if (results.length > 10) {
    suggestions.push(`Found many results - try being more specific`);
  }

  if (results.length === 1) {
    suggestions.push(`Only one result found - consider expanding search`);
  }

  // Travel-based suggestions
  const farPlaces = withDistance.filter(p => p.distanceMeters > 5000);
  if (farPlaces.length > results.length / 2) {
    suggestions.push(`Most places are far - try searching closer to your location`);
  }

  const walkable = withDistance.filter(p => p.distanceMeters < 1000);
  if (walkable.length > 0) {
    suggestions.push(`${walkable.length} places within walking distance`);
  }

  // Warnings
  if (withRatings.length === 0) {
    warnings.push("No ratings available for these results");
  }

  if (results.every((p: any) => !p.openNow)) {
    warnings.push("None are currently open");
  }

  // Warning if no travel info available
  if (withDistance.length === 0 && results.length > 0) {
    warnings.push("Travel times not available - location may be needed");
  }

  return {
    summary,
    highlights,
    suggestions,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Generate insights from direction results
 */
export function generateDirectionInsights(route: any): InsightObject {
  const highlights: string[] = [];
  const suggestions: string[] = [];

  const distanceKm = (route.distanceMeters / 1000).toFixed(1);
  const durationMins = Math.round(route.durationSeconds / 60);

  const summary = `${durationMins}min (${distanceKm}km) via ${route.summary || "fastest route"}`;

  highlights.push(`Distance: ${distanceKm}km`);
  highlights.push(`Duration: ${durationMins} minutes`);

  if (route.legs && route.legs.length > 0) {
    const stepCount = route.legs.reduce(
      (sum: number, leg: any) => sum + (leg.steps?.length || 0),
      0
    );
    if (stepCount > 0) {
      highlights.push(`${stepCount} steps`);
    }
  }

  // Suggestions for alternatives
  suggestions.push("Use get-directions with different travel mode for comparison");
  if (durationMins > 30) {
    suggestions.push("Consider public transit for faster travel");
  }

  return { summary, highlights, suggestions };
}

/**
 * Generate insights from geocoding results
 */
export function generateGeocodeInsights(
  results: any[],
  query: string
): InsightObject {
  const highlights: string[] = [];
  const suggestions: string[] = [];
  const warnings: string[] = [];

  if (results.length === 0) {
    return {
      summary: `No location found for "${query}"`,
      highlights: [],
      suggestions: [
        "Check the spelling",
        "Try adding city or state name",
        "Use a more complete address",
      ],
      warnings: ["Address not recognized"],
    };
  }

  const firstResult = results[0];
  const summary = `Located: ${firstResult.formattedAddress}`;

  const confidence =
    firstResult.locationType === "ROOFTOP"
      ? "Exact match"
      : firstResult.locationType === "RANGE_INTERPOLATED"
        ? "Approximate (range)"
        : "Approximate (geometric center)";

  highlights.push(`Confidence: ${confidence}`);

  if (results.length > 1) {
    warnings.push(`${results.length - 1} other matches found - using top result`);
    suggestions.push(`Try being more specific if this isn't what you wanted`);
  }

  return { summary, highlights, suggestions, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Generate insights from distance matrix results
 */
export function generateDistanceMatrixInsights(
  matrix: any[][],
  originCount: number,
  destinationCount: number
): InsightObject {
  const highlights: string[] = [];
  const suggestions: string[] = [];

  const summary = `Distance matrix: ${originCount} origins × ${destinationCount} destinations`;

  // Calculate min/max distances
  let minDistance = Infinity;
  let maxDistance = 0;

  for (const row of matrix) {
    for (const cell of row) {
      if (cell.distanceMeters > 0) {
        minDistance = Math.min(minDistance, cell.distanceMeters);
        maxDistance = Math.max(maxDistance, cell.distanceMeters);
      }
    }
  }

  if (minDistance !== Infinity) {
    const minKm = (minDistance / 1000).toFixed(1);
    const maxKm = (maxDistance / 1000).toFixed(1);
    highlights.push(`Distance range: ${minKm}km to ${maxKm}km`);
  }

  // Count unreachable routes
  let unreachable = 0;
  for (const row of matrix) {
    for (const cell of row) {
      if (cell.status !== "OK") unreachable++;
    }
  }

  if (unreachable > 0) {
    suggestions.push(`${unreachable} routes couldn't be calculated`);
  }

  return { summary, highlights, suggestions };
}
