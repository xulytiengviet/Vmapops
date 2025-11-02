'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, MessageSquare } from 'lucide-react';

interface VibeAttribute {
  name: string;
  score: number;
  count: number;
  evidence: string[];
}

interface VibeScoreCardProps {
  placeId: string;
  placeName: string;
  vibeAttributes: Record<string, {
    score: number;
    count: number;
    evidence: string[];
  }>;
  overallScore?: number;
}

export function VibeScoreCard({
  placeId: _placeId,
  placeName: _placeName,
  vibeAttributes,
  overallScore
}: VibeScoreCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Convert attributes to array and sort by score
  const attributes: VibeAttribute[] = Object.entries(vibeAttributes)
    .map(([name, data]) => ({
      name,
      ...data,
    }))
    .sort((a, b) => b.score - a.score);

  // Calculate overall score if not provided
  const calculatedScore = overallScore ??
    (attributes.length > 0
      ? attributes.reduce((sum, attr) => sum + attr.score, 0) / attributes.length
      : 0);

  // Get score color
  const getScoreColor = (score: number): string => {
    if (score >= 0.7) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 0.4) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  // Get bar color
  const getBarColor = (score: number): string => {
    if (score >= 0.7) return 'bg-green-500';
    if (score >= 0.4) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (attributes.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-semibold text-gray-700">Vibe Score</span>
            <div className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getScoreColor(calculatedScore)}`}>
              {(calculatedScore * 100).toFixed(0)}%
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick preview of top attributes */}
        {!expanded && (
          <div className="mt-2 flex flex-wrap gap-1">
            {attributes.slice(0, 3).map((attr) => (
              <span
                key={attr.name}
                className={`px-2 py-0.5 rounded-full text-xs ${
                  attr.score >= 0.7
                    ? 'bg-green-100 text-green-700'
                    : attr.score >= 0.4
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {attr.name}
              </span>
            ))}
            {attributes.length > 3 && (
              <span className="text-xs text-gray-500">+{attributes.length - 3} more</span>
            )}
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          {attributes.map((attr) => (
            <div key={attr.name} className="mt-3">
              {/* Attribute Header */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700 capitalize">
                  {attr.name.replace(/_/g, ' ')}
                </span>
                <div className="flex items-center gap-2">
                  {attr.count > 0 && (
                    <span className="text-xs text-gray-500">
                      {attr.count} mention{attr.count !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className={`text-sm font-semibold ${attr.score >= 0.7 ? 'text-green-600' : attr.score >= 0.4 ? 'text-yellow-600' : 'text-gray-400'}`}>
                    {(attr.score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Score Bar */}
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${getBarColor(attr.score)}`}
                  style={{ width: `${attr.score * 100}%` }}
                />
              </div>

              {/* Evidence (if any) */}
              {attr.evidence.length > 0 && (
                <div className="space-y-1 mt-2">
                  {attr.evidence.slice(0, 2).map((text, idx) => (
                    <div key={idx} className="flex items-start gap-1">
                      <MessageSquare className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-600 italic line-clamp-2">
                        "{text}"
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Overall Summary */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Overall Match</span>
              <div className={`px-3 py-1 rounded-full text-sm font-semibold ${getScoreColor(calculatedScore)}`}>
                {calculatedScore >= 0.7 ? 'Excellent' : calculatedScore >= 0.4 ? 'Good' : 'Low'} Match
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact vibe badge for inline display
 */
export function VibeBadge({
  score,
  attribute
}: {
  score: number;
  attribute: string;
}) {
  const getColor = () => {
    if (score >= 0.7) return 'bg-green-100 text-green-700 border-green-200';
    if (score >= 0.4) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${getColor()}`}>
      <Sparkles className="w-3 h-3" />
      <span className="capitalize">{attribute.replace(/_/g, ' ')}</span>
      <span className="font-semibold">{(score * 100).toFixed(0)}%</span>
    </div>
  );
}

/**
 * Minimal vibe indicator for list views
 */
export function VibeIndicator({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 0.7) return 'bg-green-500';
    if (score >= 0.4) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

  return (
    <div className="flex items-center gap-1">
      <Sparkles className="w-3.5 h-3.5 text-purple-500" />
      <div className="flex gap-0.5">
        {[0.33, 0.66, 1].map((threshold, idx) => (
          <div
            key={idx}
            className={`w-1.5 h-3 rounded-sm transition-all ${
              score >= threshold ? getColor() : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}