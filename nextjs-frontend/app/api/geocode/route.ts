import { NextRequest, NextResponse } from 'next/server';
import { GeocodingService } from '@/lib/services/geocoding-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address } = body;

    if (!address || typeof address !== 'string') {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    const geocodingService = new GeocodingService();
    const results = await geocodingService.geocode(address);

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('[Geocode API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Geocoding failed' },
      { status: 500 }
    );
  }
}

