/**
 * Tools Index
 * Central export for all Mastra tools
 */

export { searchPlaces } from "./search-places";
export { searchAlongRoute } from "./search-along-route";
export { geocode } from "./geocode";
export { getDirections } from "./get-directions";
export { getPlaceDetails } from "./get-place-details";
export { calculateDistanceMatrix } from "./calculate-distance-matrix";
export { mapControl } from "./map-control";
export { mapObserve } from "./map-observe";
export { navigateToPlace } from "./navigate-to-place";
export { tripPlan } from "./trip-plan";

// Restaurant interaction tools
export { getRestaurantMenu } from "./get-restaurant-menu";
export { getPopularDishes } from "./get-popular-dishes";
export { checkBookingOptions } from "./check-booking-options";
export { generateBookingLink } from "./generate-booking-link";
export { prepareCallScript } from "./prepare-call-script";

// Re-export utilities
export * from "./utils/distance-calculator";
export * from "./utils/insight-generator";
