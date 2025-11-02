/**
 * MapOps - Main Application Logic
 * Handles user interactions and coordinates between UI and map services
 */

// Wait for DOM and Maps API to be ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    
    // Also listen for mapReady event from map-setup.ts
    window.addEventListener('mapReady', () => {
        console.log('mapReady event received');
        if (typeof google !== 'undefined' && (window as any).mapOps && (window as any).mapOps.map) {
            console.log('Map ready via event, initializing app');
            initializeApp();
        }
    });
    
    // Wait for map to be initialized (fallback)
    let attempts = 0;
    const maxAttempts = 100; // 10 seconds max
    const checkMapReady = setInterval(() => {
        attempts++;
        if (typeof google !== 'undefined' && (window as any).mapOps && (window as any).mapOps.map) {
            clearInterval(checkMapReady);
            console.log('Map ready, initializing app after', attempts, 'attempts');
            initializeApp();
        } else if (attempts >= maxAttempts) {
            clearInterval(checkMapReady);
            console.error('Timeout waiting for map to initialize');
            console.log('google available:', typeof google !== 'undefined');
            console.log('mapOps available:', !!(window as any).mapOps);
            console.log('mapOps.map available:', !!(window as any).mapOps?.map);
        }
    }, 100);
});

/**
 * Initialize the application
 */
function initializeApp(): void {
    console.log('MapOps application initialized');

    const mapOps = (window as any).mapOps;
    console.log('mapOps available:', !!mapOps);
    console.log('mapOps.map:', !!mapOps?.map);
    console.log('mapOps.placesService:', !!mapOps?.placesService);
    console.log('InfoWindowManager class:', typeof (window as any).InfoWindowManager);
    
    const queryInput = document.getElementById('query-input') as HTMLInputElement;
    const searchBtn = document.getElementById('search-btn') as HTMLButtonElement;

    if (!queryInput || !searchBtn) {
        console.error('Required UI elements not found');
        return;
    }

    // Initialize InfoWindowManager
    if (mapOps?.map && mapOps?.placesService) {
        const InfoWindowManager = (window as any).InfoWindowManager;
        if (InfoWindowManager) {
            infoWindowManager = new InfoWindowManager(mapOps.map, mapOps.placesService);
            // Expose infoWindowManager on mapOps for global access
            (window as any).mapOps.infoWindowManager = infoWindowManager;
            console.log('InfoWindow Manager initialized');
        } else {
            console.warn('InfoWindowManager class not found');
        }
    } else {
        console.warn('Cannot initialize InfoWindowManager - mapOps.map or placesService not available');
    }

    // Search button click handler
    searchBtn.addEventListener('click', handleSearch);

    // Enter key handler in input
    queryInput.addEventListener('keypress', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });

    // Focus input on page load
    queryInput.focus();
}

/**
 * Handle search query from user
 */
function handleSearch(): void {
    const queryInput = document.getElementById('query-input') as HTMLInputElement;
    
    if (!queryInput) {
        console.error('Query input not found');
        return;
    }

    const query = queryInput.value.trim();

    if (!query) {
        alert('Please enter a search query');
        return;
    }

    console.log('Search query:', query);

    // TODO: Implement NLP parsing and Places API search
    // For now, just log the query
    showPlaceholderSearch(query);
}

/**
 * Global state for search results and markers
 */
let searchResults: any[] = [];
let searchMarkers: google.maps.Marker[] = [];
let infoWindowManager: any = null;

/**
 * Perform place search using Google Places API
 */
async function performSearch(query: string): Promise<void> {
    const mapOps = (window as any).mapOps;

    if (!mapOps?.placesService || !mapOps?.userLocation) {
        console.error('Services not ready');
        alert('Map services not ready. Please wait...');
        return;
    }

    try {
        // Show loading state
        showLoadingState(true);

        // Call Places API
        const results = await mapOps.placesService.textSearch(query, {
            location: mapOps.userLocation,
            radius: 2000,
            maxResultCount: 20,
            language: 'en'
        });

        if (!results || results.length === 0) {
            showNoResults();
            showLoadingState(false);
            return;
        }

        // Store results
        searchResults = results;

        // Clear previous markers
        clearSearchMarkers();

        // Create markers for each result
        displayResults(results);

        showLoadingState(false);

        console.log(`Found ${results.length} results`);
    } catch (error) {
        console.error('Search error:', error);
        showLoadingState(false);
        showErrorMessage('Search failed. Please try again.');
    }
}

/**
 * Display search results on map with markers
 */
function displayResults(results: any[]): void {
    const mapOps = (window as any).mapOps;

    if (!mapOps?.map) {
        console.error('Map not available');
        return;
    }

    // Clear previous markers
    searchMarkers.forEach(marker => marker.setMap(null));
    searchMarkers = [];

    // Create markers for each result
    results.forEach((place, index) => {
        const location = {
            lat: place.location?.latitude || place.geometry?.location?.lat?.() || 0,
            lng: place.location?.longitude || place.geometry?.location?.lng?.() || 0
        };

        if (location.lat === 0 && location.lng === 0) {
            console.warn('Invalid location for place:', place);
            return;
        }

        // Create marker
        const marker = mapOps.addMarker(location, {
            title: place.displayName || place.name || `Place ${index + 1}`,
            icon: getMarkerIcon(index),
            zIndex: index
        });

        if (marker) {
            searchMarkers.push(marker);

            // Add click listener
            marker.addListener('click', () => {
                highlightResult(index);
            });
        }
    });

    // Display results in sidebar
    displayResultsInSidebar(results);

    // Fit map bounds to show all results
    if (searchMarkers.length > 0) {
        fitMapToMarkers(searchMarkers, mapOps.map);
    }
}

/**
 * Get marker icon based on index
 */
function getMarkerIcon(index: number): any {
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#FF33F6', '#FFD700'];
    const color = colors[index % colors.length];

    // Return a simple colored marker as SVG
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
        <circle cx="16" cy="16" r="12" fill="${color}" stroke="white" stroke-width="2"/>
    </svg>`;

    return {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
        scaledSize: new google.maps.Size(32, 32),
        anchor: new google.maps.Point(16, 16)
    };
}

/**
 * Fit map bounds to show all markers
 */
function fitMapToMarkers(markers: google.maps.Marker[], map: google.maps.Map): void {
    const bounds = new google.maps.LatLngBounds();

    markers.forEach((marker) => {
        const position = marker.getPosition();
        if (position) {
            bounds.extend(position);
        }
    });

    // Add some padding
    map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
}

/**
 * Clear search markers from map
 */
function clearSearchMarkers(): void {
    searchMarkers.forEach((marker) => {
        marker.setMap(null);
    });
    searchMarkers = [];

    // Close any open info windows
    if (infoWindowManager) {
        infoWindowManager.closeInfoWindow();
    }
}


/**
 * Show loading indicator
 */
function showLoadingState(loading: boolean): void {
    const loadingEl = document.getElementById('loading-spinner');
    if (loadingEl) {
        loadingEl.style.display = loading ? 'block' : 'none';
    }
}

/**
 * Show error message to user
 */
function showErrorMessage(message: string): void {
    const errorEl = document.getElementById('error-message');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 5000);
    }
}

/**
 * Show no results message
 */
function showNoResults(): void {
    clearSearchMarkers();
    showErrorMessage('No places found. Try a different search.');
}

/**
 * Display results in sidebar
 */
function displayResultsInSidebar(results: any[]): void {
    const resultsList = document.getElementById('results-list');
    if (!resultsList) return;

    if (results.length === 0) {
        resultsList.innerHTML = '<p style="color: #70757a; font-size: 13px; text-align: center; padding: 20px;">No results found</p>';
        return;
    }

    let html = '';
    results.forEach((place, index) => {
        const name = place.displayName || place.name || 'Unknown';
        const address = place.formattedAddress || place.formatted_address || place.vicinity || '';
        const rating = place.rating || 0;
        const reviewCount = place.userRatingCount || place.user_ratings_total || 0;

        html += `
            <div class="result-item" data-place-index="${index}" onclick="highlightResult(${index})">
                <p class="result-name">${escapeHtml(name)}</p>
                <p class="result-address">${escapeHtml(address.substring(0, 50))}${address.length > 50 ? '...' : ''}</p>
                <div class="result-meta">
                    <span class="result-rating">★ ${rating > 0 ? rating.toFixed(1) : 'N/A'}</span>
                    <span>${reviewCount} reviews</span>
                </div>
            </div>
        `;
    });

    resultsList.innerHTML = html;
}

/**
 * Highlight result in sidebar and show info window
 */
function highlightResult(index: number): void {
    if (!searchResults[index]) return;

    // Remove previous active
    document.querySelectorAll('.result-item').forEach(el => {
        el.classList.remove('active');
    });

    // Add active to clicked
    const element = document.querySelector(`[data-place-index="${index}"]`);
    if (element) {
        element.classList.add('active');
    }

    // Show info window for this marker
    if (infoWindowManager && searchMarkers[index]) {
        const place = searchResults[index];
        console.log('highlightResult - place:', place);
        console.log('highlightResult - place ID:', place.id || place.place_id);
        
        // First, show info window with existing data (immediate feedback)
        if (place && (place.rating || place.displayName || place.name)) {
            console.log('Showing info window with existing place data');
            infoWindowManager.showPlaceDetailsFromData(place, searchMarkers[index]);
        }
        
        // Then try to fetch additional details
        // Extract place ID - handle both new API (id) and legacy API (place_id) formats
        let placeId = place.id || place.place_id;
        
        // If placeId includes 'places/' prefix, remove it (new API format)
        if (placeId && placeId.startsWith('places/')) {
            placeId = placeId.replace('places/', '');
        }
        
        if (placeId) {
            console.log('Fetching additional details for placeId:', placeId);
            // Fetch and update with full details
            infoWindowManager.showPlaceDetails(placeId, searchMarkers[index]).catch(error => {
                console.warn('Could not fetch additional details, using existing data:', error);
            });
        } else {
            console.warn('No place ID found for place:', place);
            // Keep showing the info window with existing data
        }
    } else {
        console.warn('Cannot show info window - infoWindowManager:', !!infoWindowManager, 'marker:', !!searchMarkers[index]);
    }
}


/**
 * Escape HTML
 */
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Placeholder function for search functionality
 * Routes to actual search implementation
 */
function showPlaceholderSearch(query: string): void {
    console.log('Processing query:', query);
    performSearch(query);
}
