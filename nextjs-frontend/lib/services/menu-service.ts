/**
 * Menu Service
 * Fetches and manages restaurant menu data from multiple sources
 * Uses Google Places photos, OCR, and caching
 */

import { PlacesService } from './places-service';
import { getOCRHelper, OCRHelper } from '../utils/ocr-helper';

export interface MenuItem {
  name: string;
  price?: string;
  description?: string;
  category?: string;
  dietary?: string[]; // vegetarian, vegan, gluten-free, etc.
  popular?: boolean;
  imageUrl?: string;
}

export interface MenuSection {
  name: string;
  items: MenuItem[];
}

export interface RestaurantMenu {
  restaurantName: string;
  placeId: string;
  lastUpdated: Date;
  source: 'photos' | 'website' | 'api' | 'manual';
  sections: MenuSection[];
  rawMenuText?: string;
  confidence?: number;
}

interface MenuCache {
  [placeId: string]: {
    menu: RestaurantMenu;
    timestamp: number;
  };
}

export class MenuService {
  private placesService: PlacesService;
  private ocrHelper: OCRHelper;
  private cache: MenuCache = {};
  private cacheExpiryMs = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor() {
    this.placesService = new PlacesService();
    this.ocrHelper = getOCRHelper();
    this.loadCacheFromStorage();
  }

  /**
   * Get restaurant menu using multiple sources
   */
  async getRestaurantMenu(
    placeId: string,
    restaurantName?: string,
    forceRefresh: boolean = false
  ): Promise<RestaurantMenu | null> {
    // Check cache first
    if (!forceRefresh) {
      const cached = this.getCachedMenu(placeId);
      if (cached) {
        console.log(`[MenuService] Returning cached menu for ${placeId}`);
        return cached;
      }
    }

    try {
      console.log(`[MenuService] Fetching menu for ${placeId}`);

      // 1. Try to get menu from Google Places photos
      const menuFromPhotos = await this.getMenuFromPhotos(placeId, restaurantName);
      if (menuFromPhotos) {
        this.cacheMenu(placeId, menuFromPhotos);
        return menuFromPhotos;
      }

      // 2. Try to get menu from restaurant website (future enhancement)
      // const menuFromWebsite = await this.getMenuFromWebsite(placeId);

      // 3. Return null if no menu found
      console.log(`[MenuService] No menu found for ${placeId}`);
      return null;
    } catch (error) {
      console.error(`[MenuService] Error getting menu for ${placeId}:`, error);
      return null;
    }
  }

  /**
   * Get menu from Google Places photos using OCR
   */
  private async getMenuFromPhotos(
    placeId: string,
    restaurantName?: string
  ): Promise<RestaurantMenu | null> {
    try {
      // Get place details with photos
      const placeDetails = await this.placesService.getPlaceDetails(placeId, [
        'place_id',
        'name',
        'photos',
      ]);

      if (!placeDetails || !placeDetails.photos) {
        console.log(`[MenuService] No photos found for place ${placeId}`);
        return null;
      }

      const name = restaurantName || placeDetails.name || 'Restaurant';

      // Filter photos that might be menus
      // Google Places doesn't have a direct "menu" tag, so we'll process the first few photos
      // In a production app, you might want to use image classification to identify menu photos
      const photosToProcess = placeDetails.photos.slice(0, 5); // Process up to 5 photos

      const menuTexts: Array<{ text: string; confidence: number; items: any[] }> = [];

      for (const photo of photosToProcess) {
        try {
          // Construct photo URL
          const photoUrl = this.constructPhotoUrl(photo.photo_reference);

          // Extract text using OCR
          const ocrResult = await this.ocrHelper.extractTextFromImage(photoUrl);

          // Only consider if confidence is reasonable and text contains menu-like content
          if (ocrResult.confidence > 0.6 && this.looksLikeMenu(ocrResult.text)) {
            menuTexts.push({
              text: ocrResult.text,
              confidence: ocrResult.confidence,
              items: ocrResult.menuItems || [],
            });
          }
        } catch (error) {
          console.warn(`[MenuService] Failed to process photo:`, error);
        }
      }

      if (menuTexts.length === 0) {
        return null;
      }

      // Use the menu with highest confidence
      const bestMenu = menuTexts.reduce((best, current) =>
        current.confidence > best.confidence ? current : best
      );

      // Parse menu items into sections
      const sections = this.parseMenuIntoSections(bestMenu.items, bestMenu.text);

      return {
        restaurantName: name,
        placeId,
        lastUpdated: new Date(),
        source: 'photos',
        sections,
        rawMenuText: bestMenu.text,
        confidence: bestMenu.confidence,
      };
    } catch (error) {
      console.error(`[MenuService] Error getting menu from photos:`, error);
      return null;
    }
  }

  /**
   * Construct Google Places photo URL
   */
  private constructPhotoUrl(photoReference: string): string {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photoreference=${photoReference}&key=${apiKey}`;
  }

  /**
   * Check if extracted text looks like a menu
   */
  private looksLikeMenu(text: string): boolean {
    if (!text || text.length < 50) return false;

    const menuIndicators = [
      /\$\d+/i, // Price patterns
      /appetizer|starter|entree|main|dessert|beverage|drink/i,
      /breakfast|lunch|dinner|brunch/i,
      /small|medium|large/i,
      /menu/i,
    ];

    let matchCount = 0;
    for (const pattern of menuIndicators) {
      if (pattern.test(text)) {
        matchCount++;
      }
    }

    // Consider it a menu if at least 2 indicators are present
    return matchCount >= 2;
  }

  /**
   * Parse menu items into organized sections
   */
  private parseMenuIntoSections(items: any[], _rawText: string): MenuSection[] {
    const sections: MenuSection[] = [];
    const sectionMap: { [key: string]: MenuItem[] } = {};

    // Common section names to look for
    const sectionPatterns = [
      { pattern: /appetizer|starter/i, name: 'Appetizers' },
      { pattern: /salad/i, name: 'Salads' },
      { pattern: /soup/i, name: 'Soups' },
      { pattern: /entree|main|entrée/i, name: 'Entrees' },
      { pattern: /pasta/i, name: 'Pasta' },
      { pattern: /pizza/i, name: 'Pizza' },
      { pattern: /sandwich|burger/i, name: 'Sandwiches' },
      { pattern: /dessert|sweet/i, name: 'Desserts' },
      { pattern: /beverage|drink|cocktail/i, name: 'Beverages' },
      { pattern: /side/i, name: 'Sides' },
    ];

    // Process items and group by category
    for (const item of items) {
      const menuItem: MenuItem = {
        name: item.name,
        price: item.price,
        description: item.description,
        category: item.category,
        dietary: this.extractDietaryInfo(item.name + ' ' + (item.description || '')),
      };

      // Determine section
      let sectionName = item.category || 'Other';

      // If no category, try to infer from item name/description
      if (sectionName === 'Other') {
        const itemText = `${item.name} ${item.description || ''}`.toLowerCase();
        for (const { pattern, name } of sectionPatterns) {
          if (pattern.test(itemText)) {
            sectionName = name;
            break;
          }
        }
      }

      if (!sectionMap[sectionName]) {
        sectionMap[sectionName] = [];
      }
      sectionMap[sectionName].push(menuItem);
    }

    // Convert map to sections array
    for (const [name, items] of Object.entries(sectionMap)) {
      sections.push({ name, items });
    }

    // Sort sections in typical menu order
    const sectionOrder = [
      'Appetizers',
      'Soups',
      'Salads',
      'Entrees',
      'Pasta',
      'Pizza',
      'Sandwiches',
      'Sides',
      'Desserts',
      'Beverages',
      'Other',
    ];

    sections.sort((a, b) => {
      const aIndex = sectionOrder.indexOf(a.name);
      const bIndex = sectionOrder.indexOf(b.name);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    return sections;
  }

  /**
   * Extract dietary information from text
   */
  private extractDietaryInfo(text: string): string[] {
    const dietary: string[] = [];
    const lowerText = text.toLowerCase();

    const dietaryPatterns = [
      { pattern: /vegan|plant[- ]based/i, label: 'vegan' },
      { pattern: /vegetarian|veggie/i, label: 'vegetarian' },
      { pattern: /gluten[- ]free|gf/i, label: 'gluten-free' },
      { pattern: /dairy[- ]free|df/i, label: 'dairy-free' },
      { pattern: /nut[- ]free/i, label: 'nut-free' },
      { pattern: /halal/i, label: 'halal' },
      { pattern: /kosher/i, label: 'kosher' },
      { pattern: /organic/i, label: 'organic' },
      { pattern: /spicy|hot/i, label: 'spicy' },
    ];

    for (const { pattern, label } of dietaryPatterns) {
      if (pattern.test(lowerText)) {
        dietary.push(label);
      }
    }

    return dietary;
  }

  /**
   * Get cached menu if not expired
   */
  private getCachedMenu(placeId: string): RestaurantMenu | null {
    const cached = this.cache[placeId];
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.cacheExpiryMs) {
      delete this.cache[placeId];
      return null;
    }

    return cached.menu;
  }

  /**
   * Cache menu data
   */
  private cacheMenu(placeId: string, menu: RestaurantMenu): void {
    this.cache[placeId] = {
      menu,
      timestamp: Date.now(),
    };
    this.saveCacheToStorage();
  }

  /**
   * Save cache to localStorage
   */
  private saveCacheToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      // Only save recent entries to avoid localStorage limits
      const recentEntries = Object.entries(this.cache)
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .slice(0, 50); // Keep 50 most recent

      const cacheData = Object.fromEntries(recentEntries);
      localStorage.setItem('menu_cache', JSON.stringify(cacheData));
    } catch (error) {
      console.warn('[MenuService] Failed to save cache:', error);
    }
  }

  /**
   * Load cache from localStorage
   */
  private loadCacheFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('menu_cache');
      if (stored) {
        this.cache = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('[MenuService] Failed to load cache:', error);
    }
  }

  /**
   * Clear cache for a specific restaurant
   */
  clearCache(placeId?: string): void {
    if (placeId) {
      delete this.cache[placeId];
    } else {
      this.cache = {};
    }
    this.saveCacheToStorage();
  }
}

// Singleton instance
let instance: MenuService | null = null;

export function getMenuService(): MenuService {
  if (!instance) {
    instance = new MenuService();
  }
  return instance;
}