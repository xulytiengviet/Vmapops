/**
 * OCR Helper
 * Integrates with Google Vision API for menu text extraction from images
 */

interface OCRResult {
  text: string;
  confidence: number;
  menuItems?: ParsedMenuItem[];
}

interface ParsedMenuItem {
  name: string;
  price?: string;
  description?: string;
  category?: string;
}

export class OCRHelper {
  private apiKey: string;
  private visionApiUrl = 'https://vision.googleapis.com/v1/images:annotate';

  constructor() {
    this.apiKey = process.env.GOOGLE_VISION_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[OCRHelper] Google Vision API key not configured');
    }
  }

  /**
   * Extract text from image URL using Google Vision API
   */
  async extractTextFromImage(imageUrl: string): Promise<OCRResult> {
    if (!this.apiKey) {
      throw new Error('Google Vision API key not configured');
    }

    try {
      // Prepare request for Google Vision API
      const request = {
        requests: [
          {
            image: {
              source: {
                imageUri: imageUrl,
              },
            },
            features: [
              {
                type: 'DOCUMENT_TEXT_DETECTION',
                maxResults: 1,
              },
            ],
          },
        ],
      };

      // Call Google Vision API
      const response = await fetch(`${this.visionApiUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Vision API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`Vision API error: ${data.error.message}`);
      }

      const textAnnotation = data.responses[0]?.fullTextAnnotation;

      if (!textAnnotation) {
        return {
          text: '',
          confidence: 0,
          menuItems: [],
        };
      }

      const extractedText = textAnnotation.text || '';

      // Calculate average confidence from pages
      const confidence = this.calculateConfidence(textAnnotation);

      // Parse menu items from text
      const menuItems = this.parseMenuItems(extractedText);

      return {
        text: extractedText,
        confidence,
        menuItems,
      };
    } catch (error) {
      console.error('[OCRHelper] Error extracting text from image:', error);
      throw error;
    }
  }

  /**
   * Extract text from base64 encoded image
   */
  async extractTextFromBase64(base64Image: string): Promise<OCRResult> {
    if (!this.apiKey) {
      throw new Error('Google Vision API key not configured');
    }

    try {
      // Remove data URL prefix if present
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

      const request = {
        requests: [
          {
            image: {
              content: base64Data,
            },
            features: [
              {
                type: 'DOCUMENT_TEXT_DETECTION',
                maxResults: 1,
              },
            ],
          },
        ],
      };

      const response = await fetch(`${this.visionApiUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Vision API error: ${response.statusText}`);
      }

      const data = await response.json();
      const textAnnotation = data.responses[0]?.fullTextAnnotation;

      if (!textAnnotation) {
        return {
          text: '',
          confidence: 0,
          menuItems: [],
        };
      }

      const extractedText = textAnnotation.text || '';
      const confidence = this.calculateConfidence(textAnnotation);
      const menuItems = this.parseMenuItems(extractedText);

      return {
        text: extractedText,
        confidence,
        menuItems,
      };
    } catch (error) {
      console.error('[OCRHelper] Error extracting text from base64:', error);
      throw error;
    }
  }

  /**
   * Parse menu items from extracted text
   * Uses patterns to identify dish names, prices, and descriptions
   */
  private parseMenuItems(text: string): ParsedMenuItem[] {
    const items: ParsedMenuItem[] = [];
    const lines = text.split('\n').filter(line => line.trim());

    // Common price patterns
    const pricePattern = /\$?\d+\.?\d{0,2}/;

    // Category patterns (usually in caps or followed by colon)
    const categoryPattern = /^[A-Z\s]+[:]?$/;

    let currentCategory = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if this is a category header
      if (categoryPattern.test(line) && line.length < 30) {
        currentCategory = line.replace(':', '').trim();
        continue;
      }

      // Look for price in current or next line
      const priceMatch = line.match(pricePattern);
      const nextLinePrice = lines[i + 1]?.match(pricePattern);

      if (priceMatch || nextLinePrice) {
        const price = priceMatch ? priceMatch[0] : nextLinePrice ? nextLinePrice[0] : undefined;

        // Extract item name (text before price or entire line)
        let itemName = line;
        if (priceMatch) {
          itemName = line.substring(0, line.indexOf(priceMatch[0])).trim();
        }

        // Skip if item name is too short or just numbers
        if (itemName.length < 3 || /^\d+$/.test(itemName)) {
          continue;
        }

        // Look for description (next line after price or item)
        let description = '';
        const descIndex = nextLinePrice ? i + 2 : i + 1;
        if (descIndex < lines.length) {
          const potentialDesc = lines[descIndex];
          // If next line doesn't look like a new item or price, treat as description
          if (!pricePattern.test(potentialDesc) && potentialDesc.length > 10) {
            description = potentialDesc;
          }
        }

        items.push({
          name: this.cleanMenuItemName(itemName),
          price: price,
          description: description,
          category: currentCategory || undefined,
        });
      }
    }

    return items;
  }

  /**
   * Clean menu item name
   */
  private cleanMenuItemName(name: string): string {
    // Remove common prefixes/suffixes
    return name
      .replace(/^\d+\.\s*/, '') // Remove numbered lists
      .replace(/\s*\.\.\.*\s*$/, '') // Remove trailing dots
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Calculate confidence score from Vision API response
   */
  private calculateConfidence(textAnnotation: any): number {
    if (!textAnnotation.pages || textAnnotation.pages.length === 0) {
      return 0;
    }

    // Calculate average confidence from blocks
    let totalConfidence = 0;
    let blockCount = 0;

    for (const page of textAnnotation.pages) {
      for (const block of page.blocks || []) {
        if (block.confidence !== undefined) {
          totalConfidence += block.confidence;
          blockCount++;
        }
      }
    }

    return blockCount > 0 ? totalConfidence / blockCount : 0.5;
  }

  /**
   * Fallback OCR using browser-based Tesseract.js (for client-side)
   * Note: This would need tesseract.js installed and imported
   */
  async extractTextFallback(_imageUrl: string): Promise<string> {
    // This is a placeholder for fallback OCR
    // In production, you might use Tesseract.js or another service
    console.warn('[OCRHelper] Fallback OCR not implemented, using Google Vision only');
    return '';
  }
}

// Singleton instance
let instance: OCRHelper | null = null;

export function getOCRHelper(): OCRHelper {
  if (!instance) {
    instance = new OCRHelper();
  }
  return instance;
}