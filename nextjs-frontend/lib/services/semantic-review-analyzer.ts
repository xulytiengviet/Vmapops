/**
 * Semantic Review Analyzer Service
 * Uses LLM to analyze place reviews against semantic attributes dynamically
 * No hardcoded keywords - understands context naturally
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

export interface Review {
  text: string;
  rating?: number;
  publishTime?: string;
  authorName?: string;
}

export interface SemanticAttributeScore {
  score: number; // 0-1, how well the place matches this attribute
  count: number; // number of mentions/evidence found
  evidence: string[]; // review excerpts that support this attribute
}

export interface SemanticAnalysisResult {
  [attribute: string]: SemanticAttributeScore;
}

export class SemanticReviewAnalyzer {
  private openrouter: ReturnType<typeof createOpenRouter>;
  private model: string = "anthropic/claude-haiku-4.5";

  constructor() {
    this.openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });
  }

  /**
   * Analyze reviews against semantic attributes using LLM
   * Returns scores and evidence for each attribute
   */
  async analyze(
    reviews: Review[],
    semanticAttributes: string[]
  ): Promise<SemanticAnalysisResult> {
    if (!reviews || reviews.length === 0 || semanticAttributes.length === 0) {
      // Return empty scores if no reviews or attributes
      return semanticAttributes.reduce((acc, attr) => {
        acc[attr] = { score: 0, count: 0, evidence: [] };
        return acc;
      }, {} as SemanticAnalysisResult);
    }

    try {
      // Prepare review text for analysis (limit to most recent 20 reviews)
      const recentReviews = reviews
        .slice(0, 20)
        .map((r, idx) => `Review ${idx + 1} (${r.rating ? `${r.rating}⭐` : 'No rating'}): ${r.text}`)
        .join('\n\n');

      const attributesList = semanticAttributes.join(', ');

      const prompt = `You are analyzing place reviews to determine how well they match specific semantic attributes.

SEMANTIC ATTRIBUTES TO ANALYZE: ${attributesList}

REVIEWS TO ANALYZE:
${recentReviews}

TASK:
For each semantic attribute, analyze the reviews and determine:
1. Score (0.0 to 1.0): How well the place matches this attribute based on review evidence
   - 1.0 = Strong match (many positive mentions)
   - 0.5 = Moderate match (some mentions, mixed)
   - 0.0 = No match or negative mentions
2. Count: Number of reviews that mention this attribute
3. Evidence: Up to 3 short excerpts (max 100 chars each) from reviews that support this attribute

IMPORTANT:
- Be context-aware: "quiet" means peaceful/calm, not silent
- "halal" means Islamic dietary compliance
- "power outlets" means electrical outlets for charging devices
- Look for both explicit mentions and implicit context
- Consider negative mentions (e.g., "NOT quiet") as negative evidence
- Only include evidence that actually supports the attribute

Return a JSON object with this exact structure:
{
  "${semanticAttributes[0]}": {
    "score": 0.85,
    "count": 8,
    "evidence": ["excerpt 1", "excerpt 2", "excerpt 3"]
  },
  ...
}

Only return valid JSON, no markdown formatting.`;

      const result = await generateText({
        model: this.openrouter(this.model),
        prompt,
        temperature: 0.3, // Lower temperature for more consistent analysis
      });

      // Parse LLM response
      const text = result.text.trim();
      
      // Remove markdown code blocks if present
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text;

      let analysis: SemanticAnalysisResult;
      try {
        analysis = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('[SemanticReviewAnalyzer] Failed to parse LLM response:', parseError);
        console.error('[SemanticReviewAnalyzer] Raw response:', text);
        // Fallback: return empty scores
        return semanticAttributes.reduce((acc, attr) => {
          acc[attr] = { score: 0, count: 0, evidence: [] };
          return acc;
        }, {} as SemanticAnalysisResult);
      }

      // Validate and normalize results
      const normalized: SemanticAnalysisResult = {};
      for (const attr of semanticAttributes) {
        const result = analysis[attr];
        if (result && typeof result === 'object') {
          normalized[attr] = {
            score: Math.max(0, Math.min(1, result.score || 0)),
            count: Math.max(0, Math.floor(result.count || 0)),
            evidence: Array.isArray(result.evidence) 
              ? result.evidence.slice(0, 3).filter((e: any) => typeof e === 'string' && e.length > 0)
              : [],
          };
        } else {
          normalized[attr] = { score: 0, count: 0, evidence: [] };
        }
      }

      return normalized;
    } catch (error) {
      console.error('[SemanticReviewAnalyzer] Error analyzing reviews:', error);
      // Return empty scores on error
      return semanticAttributes.reduce((acc, attr) => {
        acc[attr] = { score: 0, count: 0, evidence: [] };
        return acc;
      }, {} as SemanticAnalysisResult);
    }
  }

  /**
   * Calculate overall semantic score for a place
   * Combines all attribute scores with weighted average
   */
  calculateOverallScore(analysis: SemanticAnalysisResult): number {
    const attributes = Object.keys(analysis);
    if (attributes.length === 0) return 0;

    const scores = attributes.map(attr => analysis[attr].score);
    const totalScore = scores.reduce((sum, score) => sum + score, 0);
    return totalScore / attributes.length;
  }
}

