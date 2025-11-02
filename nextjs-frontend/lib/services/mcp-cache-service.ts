/**
 * MCP Cache Service
 * Caches MCP search results to reduce API costs and improve performance
 * Implements TTL-based caching with separate caches for different search types
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

export class MCPCacheService {
  private static instance: MCPCacheService;

  // Separate caches for different types of searches
  private tavilySearchCache: Map<string, CacheEntry<any>> = new Map();
  private tavilyNewsCache: Map<string, CacheEntry<any>> = new Map();
  private exaSemanticCache: Map<string, CacheEntry<any>> = new Map();
  private exaSimilarCache: Map<string, CacheEntry<any>> = new Map();

  // Cache statistics
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
  };

  // Default TTLs for different search types (in milliseconds)
  private readonly TTL_CONFIG = {
    tavilySearch: 1 * 60 * 60 * 1000,     // 1 hour for general searches
    tavilyNews: 5 * 60 * 1000,            // 5 minutes for news (very time-sensitive)
    exaSemantic: 2 * 60 * 60 * 1000,      // 2 hours for semantic searches
    exaSimilar: 6 * 60 * 60 * 1000,       // 6 hours for similarity searches
  };

  // Maximum cache sizes
  private readonly MAX_CACHE_SIZE = {
    tavilySearch: 100,
    tavilyNews: 50,
    exaSemantic: 100,
    exaSimilar: 50,
  };

  private constructor() {
    // Start cleanup interval
    setInterval(() => this.cleanupExpired(), 5 * 60 * 1000); // Every 5 minutes
  }

  public static getInstance(): MCPCacheService {
    if (!MCPCacheService.instance) {
      MCPCacheService.instance = new MCPCacheService();
    }
    return MCPCacheService.instance;
  }

  /**
   * Get cached Tavily search results
   */
  public getTavilySearch(key: string): any | null {
    return this.getCached(this.tavilySearchCache, key);
  }

  /**
   * Cache Tavily search results
   */
  public setTavilySearch(key: string, data: any, ttl?: number): void {
    this.setCached(
      this.tavilySearchCache,
      key,
      data,
      ttl || this.TTL_CONFIG.tavilySearch,
      this.MAX_CACHE_SIZE.tavilySearch
    );
  }

  /**
   * Get cached Tavily news results
   */
  public getTavilyNews(key: string): any | null {
    return this.getCached(this.tavilyNewsCache, key);
  }

  /**
   * Cache Tavily news results
   */
  public setTavilyNews(key: string, data: any, ttl?: number): void {
    this.setCached(
      this.tavilyNewsCache,
      key,
      data,
      ttl || this.TTL_CONFIG.tavilyNews,
      this.MAX_CACHE_SIZE.tavilyNews
    );
  }

  /**
   * Get cached Exa semantic search results
   */
  public getExaSemantic(key: string): any | null {
    return this.getCached(this.exaSemanticCache, key);
  }

  /**
   * Cache Exa semantic search results
   */
  public setExaSemantic(key: string, data: any, ttl?: number): void {
    this.setCached(
      this.exaSemanticCache,
      key,
      data,
      ttl || this.TTL_CONFIG.exaSemantic,
      this.MAX_CACHE_SIZE.exaSemantic
    );
  }

  /**
   * Get cached Exa similarity search results
   */
  public getExaSimilar(key: string): any | null {
    return this.getCached(this.exaSimilarCache, key);
  }

  /**
   * Cache Exa similarity search results
   */
  public setExaSimilar(key: string, data: any, ttl?: number): void {
    this.setCached(
      this.exaSimilarCache,
      key,
      data,
      ttl || this.TTL_CONFIG.exaSimilar,
      this.MAX_CACHE_SIZE.exaSimilar
    );
  }

  /**
   * Generate cache key from search parameters
   */
  public generateKey(params: Record<string, any>): string {
    // Sort params for consistent key generation
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        if (params[key] !== undefined && params[key] !== null) {
          acc[key] = params[key];
        }
        return acc;
      }, {} as Record<string, any>);

    return JSON.stringify(sortedParams);
  }

  /**
   * Clear all caches
   */
  public clearAll(): void {
    this.tavilySearchCache.clear();
    this.tavilyNewsCache.clear();
    this.exaSemanticCache.clear();
    this.exaSimilarCache.clear();
    this.stats.evictions += this.stats.size;
    this.stats.size = 0;
    console.log("[MCP Cache] All caches cleared");
  }

  /**
   * Clear specific cache type
   */
  public clearCacheType(type: 'tavilySearch' | 'tavilyNews' | 'exaSemantic' | 'exaSimilar'): void {
    const cache = this.getCache(type);
    const size = cache.size;
    cache.clear();
    this.stats.evictions += size;
    this.stats.size -= size;
    console.log(`[MCP Cache] ${type} cache cleared (${size} entries)`);
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats & { breakdown: Record<string, number> } {
    return {
      ...this.stats,
      breakdown: {
        tavilySearch: this.tavilySearchCache.size,
        tavilyNews: this.tavilyNewsCache.size,
        exaSemantic: this.exaSemanticCache.size,
        exaSimilar: this.exaSimilarCache.size,
      },
    };
  }

  /**
   * Get cache hit rate
   */
  public getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? this.stats.hits / total : 0;
  }

  // Private helper methods

  private getCached(cache: Map<string, CacheEntry<any>>, key: string): any | null {
    const entry = cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      cache.delete(key);
      this.stats.evictions++;
      this.stats.size--;
      this.stats.misses++;
      return null;
    }

    // Update hit count and stats
    entry.hits++;
    this.stats.hits++;

    console.log(`[MCP Cache] Cache hit for key: ${key.substring(0, 50)}...`);
    return entry.data;
  }

  private setCached(
    cache: Map<string, CacheEntry<any>>,
    key: string,
    data: any,
    ttl: number,
    maxSize: number
  ): void {
    // Check if we need to evict entries
    if (cache.size >= maxSize) {
      this.evictLRU(cache);
    }

    const entry: CacheEntry<any> = {
      data,
      timestamp: Date.now(),
      ttl,
      hits: 0,
    };

    cache.set(key, entry);
    this.stats.size++;

    console.log(`[MCP Cache] Cached result for key: ${key.substring(0, 50)}...`);
  }

  private getCache(type: string): Map<string, CacheEntry<any>> {
    switch (type) {
      case 'tavilySearch':
        return this.tavilySearchCache;
      case 'tavilyNews':
        return this.tavilyNewsCache;
      case 'exaSemantic':
        return this.exaSemanticCache;
      case 'exaSimilar':
        return this.exaSimilarCache;
      default:
        throw new Error(`Unknown cache type: ${type}`);
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(cache: Map<string, CacheEntry<any>>): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    let lowestHits = Infinity;

    // Find LRU entry (oldest with fewest hits)
    for (const [key, entry] of cache.entries()) {
      const score = entry.timestamp + (entry.hits * 60000); // Boost score by hits
      if (score < oldestTime) {
        oldestTime = score;
        oldestKey = key;
        lowestHits = entry.hits;
      }
    }

    if (oldestKey) {
      cache.delete(oldestKey);
      this.stats.evictions++;
      this.stats.size--;
      console.log(`[MCP Cache] Evicted LRU entry with ${lowestHits} hits`);
    }
  }

  /**
   * Clean up expired entries from all caches
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let evicted = 0;

    const cleanCache = (cache: Map<string, CacheEntry<any>>) => {
      for (const [key, entry] of cache.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          cache.delete(key);
          evicted++;
          this.stats.size--;
        }
      }
    };

    cleanCache(this.tavilySearchCache);
    cleanCache(this.tavilyNewsCache);
    cleanCache(this.exaSemanticCache);
    cleanCache(this.exaSimilarCache);

    if (evicted > 0) {
      this.stats.evictions += evicted;
      console.log(`[MCP Cache] Cleaned up ${evicted} expired entries`);
    }
  }
}

// Export singleton instance
export const mcpCache = MCPCacheService.getInstance();