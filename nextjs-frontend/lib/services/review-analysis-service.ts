/**
 * Review Analysis Service
 * Extracts dish recommendations and insights from restaurant reviews
 * Uses NLP to identify popular dishes, must-try items, and tips
 */

import { PlacesService } from './places-service';
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

export interface DishMention {
  name: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  mentions: number;
  excerpts: string[];
  rating: number; // Average rating from reviews mentioning this dish
}

export interface DishRecommendations {
  mustTry: DishMention[];
  popular: DishMention[];
  avoid: DishMention[];
  dietaryOptions: {
    vegetarian: string[];
    vegan: string[];
    glutenFree: string[];
    halal: string[];
  };
  tips: string[];
  summary: string;
}

interface ReviewAnalysisCache {
  [placeId: string]: {
    analysis: DishRecommendations;
    timestamp: number;
    reviewCount: number;
  };
}

export class ReviewAnalysisService {
  private placesService: PlacesService;
  private openrouter: ReturnType<typeof createOpenRouter>;
  private model: string = "anthropic/claude-haiku-4.5";
  private cache: ReviewAnalysisCache = {};
  private cacheExpiryMs = 30 * 24 * 60 * 60 * 1000; // 30 days

  constructor() {
    this.placesService = new PlacesService();
    this.openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    this.loadCacheFromStorage();
  }

  /**
   * Analyze reviews to extract dish recommendations
   */
  async getDishRecommendations(
    placeId: string,
    forceRefresh: boolean = false
  ): Promise<DishRecommendations> {
    // Check cache first
    if (!forceRefresh) {
      const cached = this.getCachedAnalysis(placeId);
      if (cached) {
        console.log(`[ReviewAnalysisService] Returning cached analysis for ${placeId}`);
        return cached;
      }
    }

    try {
      console.log(`[ReviewAnalysisService] Analyzing reviews for ${placeId}`);

      // Fetch place details with reviews
      const details = await this.placesService.getPlaceDetails(placeId);

      if (!details || !details.reviews || details.reviews.length === 0) {
        console.log(`[ReviewAnalysisService] No reviews found for ${placeId}`);
        return this.getEmptyRecommendations();
      }

      // Analyze reviews using LLM
      const analysis = await this.analyzeReviewsWithLLM(details.reviews, details.name);

      // Cache the results
      this.cacheAnalysis(placeId, analysis, details.reviews.length);

      return analysis;
    } catch (error) {
      console.error(`[ReviewAnalysisService] Error analyzing reviews:`, error);
      return this.getEmptyRecommendations();
    }
  }

  /**
   * Analyze reviews using LLM to extract dish recommendations
   */
  private async analyzeReviewsWithLLM(
    reviews: any[],
    restaurantName?: string
  ): Promise<DishRecommendations> {
    try {
      // Prepare reviews for analysis (limit to most recent 20)
      const reviewTexts = reviews
        .slice(0, 20)
        .map((r, idx) => `Review ${idx + 1} (${r.rating ? `${r.rating}★` : 'No rating'}): ${r.text}`)
        .join('\n\n');

      const prompt = `You are analyzing restaurant reviews to extract dish recommendations and insights.

RESTAURANT: ${restaurantName || 'Unknown'}

REVIEWS:
${reviewTexts}

TASK:
Analyze these reviews and extract:
1. Specific dishes mentioned with their sentiment
2. Must-try dishes (highly recommended)
3. Popular dishes (frequently mentioned)
4. Dishes to avoid (negative mentions)
5. Dietary options (vegetarian, vegan, gluten-free, halal)
6. Practical tips from reviewers

Return a JSON object with this exact structure:
{
  "mustTry": [
    {
      "name": "Dish Name",
      "sentiment": "positive",
      "mentions": 3,
      "excerpts": ["excerpt1", "excerpt2"],
      "rating": 4.5
    }
  ],
  "popular": [...],
  "avoid": [...],
  "dietaryOptions": {
    "vegetarian": ["dish1", "dish2"],
    "vegan": ["dish1"],
    "glutenFree": ["dish1"],
    "halal": []
  },
  "tips": [
    "Make reservations for weekend",
    "Happy hour 4-6pm has great deals"
  ],
  "summary": "Brief 1-2 sentence summary of the restaurant based on reviews"
}

IMPORTANT:
- Only include dishes that are explicitly mentioned
- Include direct quotes in excerpts (max 100 chars each)
- For sentiment, consider context (e.g., "not bad" is neutral/positive)
- Tips should be actionable advice from reviewers
- Summary should capture the overall vibe and strengths

Only return valid JSON, no markdown formatting.`;

      const result = await generateText({
        model: this.openrouter(this.model),
        prompt,
        temperature: 0.3,
      });

      // Parse LLM response
      const text = result.text.trim();

      // Remove markdown code blocks if present
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text;

      try {
        const analysis = JSON.parse(jsonText);
        return this.validateAndNormalizeAnalysis(analysis);
      } catch (parseError) {
        console.error('[ReviewAnalysisService] Failed to parse LLM response:', parseError);
        return this.getEmptyRecommendations();
      }
    } catch (error) {
      console.error('[ReviewAnalysisService] LLM analysis error:', error);
      return this.getEmptyRecommendations();
    }
  }

  /**
   * Validate and normalize the analysis result
   */
  private validateAndNormalizeAnalysis(analysis: any): DishRecommendations {
    const normalized: DishRecommendations = {
      mustTry: [],
      popular: [],
      avoid: [],
      dietaryOptions: {
        vegetarian: [],
        vegan: [],
        glutenFree: [],
        halal: [],
      },
      tips: [],
      summary: '',
    };

    // Normalize must-try dishes
    if (Array.isArray(analysis.mustTry)) {
      normalized.mustTry = analysis.mustTry.map((dish: any) => this.normalizeDishMention(dish));
    }

    // Normalize popular dishes
    if (Array.isArray(analysis.popular)) {
      normalized.popular = analysis.popular.map((dish: any) => this.normalizeDishMention(dish));
    }

    // Normalize dishes to avoid
    if (Array.isArray(analysis.avoid)) {
      normalized.avoid = analysis.avoid.map((dish: any) => this.normalizeDishMention(dish));
    }

    // Normalize dietary options
    if (analysis.dietaryOptions && typeof analysis.dietaryOptions === 'object') {
      const dietary = analysis.dietaryOptions;
      normalized.dietaryOptions = {
        vegetarian: Array.isArray(dietary.vegetarian) ? dietary.vegetarian : [],
        vegan: Array.isArray(dietary.vegan) ? dietary.vegan : [],
        glutenFree: Array.isArray(dietary.glutenFree) ? dietary.glutenFree : [],
        halal: Array.isArray(dietary.halal) ? dietary.halal : [],
      };
    }

    // Normalize tips
    if (Array.isArray(analysis.tips)) {
      normalized.tips = analysis.tips.filter((tip: any) => typeof tip === 'string');
    }

    // Normalize summary
    if (typeof analysis.summary === 'string') {
      normalized.summary = analysis.summary;
    }

    return normalized;
  }

  /**
   * Normalize a dish mention object
   */
  private normalizeDishMention(dish: any): DishMention {
    return {
      name: dish.name || 'Unknown Dish',
      sentiment: this.normalizeSentiment(dish.sentiment),
      mentions: typeof dish.mentions === 'number' ? dish.mentions : 1,
      excerpts: Array.isArray(dish.excerpts)
        ? dish.excerpts.filter((e: any) => typeof e === 'string').slice(0, 3)
        : [],
      rating: typeof dish.rating === 'number' ? dish.rating : 0,
    };
  }

  /**
   * Normalize sentiment value
   */
  private normalizeSentiment(sentiment: any): 'positive' | 'negative' | 'neutral' {
    if (typeof sentiment !== 'string') return 'neutral';
    const lower = sentiment.toLowerCase();
    if (lower.includes('positive')) return 'positive';
    if (lower.includes('negative')) return 'negative';
    return 'neutral';
  }

  /**
   * Get empty recommendations structure
   */
  private getEmptyRecommendations(): DishRecommendations {
    return {
      mustTry: [],
      popular: [],
      avoid: [],
      dietaryOptions: {
        vegetarian: [],
        vegan: [],
        glutenFree: [],
        halal: [],
      },
      tips: [],
      summary: 'No reviews available for analysis.',
    };
  }

  /**
   * Get cached analysis if not expired
   */
  private getCachedAnalysis(placeId: string): DishRecommendations | null {
    const cached = this.cache[placeId];
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.cacheExpiryMs) {
      delete this.cache[placeId];
      return null;
    }

    return cached.analysis;
  }

  /**
   * Cache analysis results
   */
  private cacheAnalysis(
    placeId: string,
    analysis: DishRecommendations,
    reviewCount: number
  ): void {
    this.cache[placeId] = {
      analysis,
      timestamp: Date.now(),
      reviewCount,
    };
    this.saveCacheToStorage();
  }

  /**
   * Save cache to localStorage
   */
  private saveCacheToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      // Only save recent entries
      const recentEntries = Object.entries(this.cache)
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .slice(0, 50);

      const cacheData = Object.fromEntries(recentEntries);
      localStorage.setItem('dish_recommendations_cache', JSON.stringify(cacheData));
    } catch (error) {
      console.warn('[ReviewAnalysisService] Failed to save cache:', error);
    }
  }

  /**
   * Load cache from localStorage
   */
  private loadCacheFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('dish_recommendations_cache');
      if (stored) {
        this.cache = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('[ReviewAnalysisService] Failed to load cache:', error);
    }
  }

  /**
   * Clear cache
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
let instance: ReviewAnalysisService | null = null;

export function getReviewAnalysisService(): ReviewAnalysisService {
  if (!instance) {
    instance = new ReviewAnalysisService();
  }
  return instance;
}