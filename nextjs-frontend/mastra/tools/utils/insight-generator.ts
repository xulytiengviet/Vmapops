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

  // Summary
  let summary = `Found ${results.length} ${searchType} results`;

  if (results.length === 0) {
    summary = `No ${searchType} found`;
    suggestions.push(`Try increasing the search radius`);
    suggestions.push(`Try a broader search term`);
    return { summary, highlights, suggestions, warnings };
  }

  // Calculate statistics
  const withRatings = results.filter((p) => p.rating);
  const avgRating =
    withRatings.length > 0
      ? withRatings.reduce((sum: number, p: any) => sum + p.rating, 0) /
        withRatings.length
      : undefined;

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

  // Suggestions
  if (results.length > 10) {
    suggestions.push(`Found many results - try being more specific`);
  }

  if (results.length === 1) {
    suggestions.push(`Only one result found - consider expanding search`);
  }

  // Warnings
  if (withRatings.length === 0) {
    warnings.push("No ratings available for these results");
  }

  if (results.every((p: any) => !p.openNow)) {
    warnings.push("None are currently open");
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
