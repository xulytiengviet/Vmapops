/**
 * Vibe Cache Service
 * Caches vibe analysis results to prevent redundant API calls and improve performance
 * Uses in-memory cache with TTL and optional Redis/localStorage persistence
 */

import { SemanticAnalysisResult } from './semantic-review-analyzer';

interface CacheEntry {
  placeId: string;
  attributes: string[];
  result: SemanticAnalysisResult;
  timestamp: number;
  reviewCount: number;
  lastReviewTime?: string;
}

export class VibeCacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_ENTRIES = 1000;
  private readonly STORAGE_KEY = 'vibe_cache_v1';

  constructor(private useLocalStorage: boolean = true) {
    if (this.useLocalStorage && typeof window !== 'undefined') {
      this.loadFromLocalStorage();
    }
  }

  /**
   * Generate cache key from placeId and semantic attributes
   */
  private getCacheKey(placeId: string, attributes: string[]): string {
    const sortedAttrs = [...attributes].sort().join(',');
    return `${placeId}:${sortedAttrs}`;
  }

  /**
   * Get cached vibe analysis if available and fresh
   */
  get(
    placeId: string,
    attributes: string[],
    reviewCount?: number,
    lastReviewTime?: string
  ): SemanticAnalysisResult | null {
    const key = this.getCacheKey(placeId, attributes);
    const entry = this.cache.get(key);

    if (!entry) {
      console.log(`[VibeCacheService] Cache miss for place ${placeId}`);
      return null;
    }

    // Check if cache is stale
    const age = Date.now() - entry.timestamp;
    if (age > this.TTL_MS) {
      console.log(`[VibeCacheService] Cache expired for place ${placeId} (age: ${age}ms)`);
      this.cache.delete(key);
      return null;
    }

    // Check if reviews have been updated
    if (reviewCount !== undefined && entry.reviewCount !== reviewCount) {
      console.log(`[VibeCacheService] Review count mismatch for ${placeId} (cached: ${entry.reviewCount}, current: ${reviewCount})`);
      this.cache.delete(key);
      return null;
    }

    if (lastReviewTime && entry.lastReviewTime !== lastReviewTime) {
      console.log(`[VibeCacheService] Reviews updated for ${placeId}`);
      this.cache.delete(key);
      return null;
    }

    console.log(`[VibeCacheService] Cache hit for place ${placeId} (age: ${Math.round(age / 1000)}s)`);
    return entry.result;
  }

  /**
   * Store vibe analysis result in cache
   */
  set(
    placeId: string,
    attributes: string[],
    result: SemanticAnalysisResult,
    reviewCount?: number,
    lastReviewTime?: string
  ): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.MAX_ENTRIES) {
      const oldestKey = this.findOldestEntry();
      if (oldestKey) {
        this.cache.delete(oldestKey);
        console.log(`[VibeCacheService] Evicted oldest entry to make room`);
      }
    }

    const key = this.getCacheKey(placeId, attributes);
    const entry: CacheEntry = {
      placeId,
      attributes,
      result,
      timestamp: Date.now(),
      reviewCount: reviewCount || 0,
      lastReviewTime,
    };

    this.cache.set(key, entry);
    console.log(`[VibeCacheService] Cached vibe analysis for ${placeId} (${attributes.length} attributes)`);

    // Persist to localStorage if enabled
    if (this.useLocalStorage && typeof window !== 'undefined') {
      this.saveToLocalStorage();
    }
  }

  /**
   * Clear cache for a specific place
   */
  clearPlace(placeId: string): void {
    let cleared = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.placeId === placeId) {
        this.cache.delete(key);
        cleared++;
      }
    }
    if (cleared > 0) {
      console.log(`[VibeCacheService] Cleared ${cleared} cache entries for place ${placeId}`);
      if (this.useLocalStorage && typeof window !== 'undefined') {
        this.saveToLocalStorage();
      }
    }
  }

  /**
   * Clear all cached data
   */
  clearAll(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[VibeCacheService] Cleared all ${size} cache entries`);

    if (this.useLocalStorage && typeof window !== 'undefined') {
      try {
        localStorage.removeItem(this.STORAGE_KEY);
      } catch (error) {
        console.error('[VibeCacheService] Failed to clear localStorage:', error);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    entries: number;
    avgAge: number;
    hitRate: number;
    memoryUsage: number;
  } {
    const now = Date.now();
    let totalAge = 0;
    let estimatedSize = 0;

    for (const entry of this.cache.values()) {
      totalAge += now - entry.timestamp;
      // Rough estimate of memory usage
      estimatedSize += JSON.stringify(entry).length;
    }

    return {
      entries: this.cache.size,
      avgAge: this.cache.size > 0 ? totalAge / this.cache.size : 0,
      hitRate: 0, // Would need to track hits/misses for this
      memoryUsage: estimatedSize,
    };
  }

  /**
   * Find the oldest cache entry for LRU eviction
   */
  private findOldestEntry(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Save cache to localStorage
   */
  private saveToLocalStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const cacheArray: CacheEntry[] = Array.from(this.cache.values());
      // Only save recent entries to avoid localStorage limits
      const recentEntries = cacheArray
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 100);

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentEntries));
      console.log(`[VibeCacheService] Saved ${recentEntries.length} entries to localStorage`);
    } catch (error) {
      console.error('[VibeCacheService] Failed to save to localStorage:', error);
    }
  }

  /**
   * Load cache from localStorage
   */
  private loadFromLocalStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return;

      const entries: CacheEntry[] = JSON.parse(stored);
      const now = Date.now();
      let loaded = 0;

      for (const entry of entries) {
        // Skip expired entries
        if (now - entry.timestamp < this.TTL_MS) {
          const key = this.getCacheKey(entry.placeId, entry.attributes);
          this.cache.set(key, entry);
          loaded++;
        }
      }

      console.log(`[VibeCacheService] Loaded ${loaded} entries from localStorage`);
    } catch (error) {
      console.error('[VibeCacheService] Failed to load from localStorage:', error);
      // Clear corrupt data
      try {
        localStorage.removeItem(this.STORAGE_KEY);
      } catch {}
    }
  }

  /**
   * Prefetch vibe analysis for multiple places
   * Useful for search results to warm the cache
   */
  async prefetch(
    places: Array<{ placeId: string; attributes: string[] }>,
    analyzeCallback: (placeId: string, attributes: string[]) => Promise<SemanticAnalysisResult>
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const { placeId, attributes } of places) {
      // Skip if already cached
      if (this.get(placeId, attributes)) {
        continue;
      }

      // Analyze and cache
      const promise = analyzeCallback(placeId, attributes)
        .then(result => {
          this.set(placeId, attributes, result);
        })
        .catch(error => {
          console.error(`[VibeCacheService] Failed to prefetch ${placeId}:`, error);
        });

      promises.push(promise);

      // Limit concurrent requests
      if (promises.length >= 5) {
        await Promise.race(promises);
      }
    }

    await Promise.all(promises);
    console.log(`[VibeCacheService] Prefetched vibe analysis for ${promises.length} places`);
  }
}

// Singleton instance
let instance: VibeCacheService | null = null;

export function getVibeCacheInstance(): VibeCacheService {
  if (!instance) {
    instance = new VibeCacheService();
  }
  return instance;
}