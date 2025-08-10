import { NextRequest, NextResponse } from 'next/server';
import { AdvancedUploader, BandwidthThrottleOptions } from '@/lib/uploader/AdvancedUploader';

/**
 * POST /api/upload/throttle - Configure bandwidth throttling
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      maxBytesPerSecond,
      adaptiveThrottling = false,
      quietHours
    } = body;

    // Validate input
    if (maxBytesPerSecond !== undefined && (typeof maxBytesPerSecond !== 'number' || maxBytesPerSecond <= 0)) {
      return NextResponse.json({
        success: false,
        error: 'maxBytesPerSecond must be a positive number',
      }, { status: 400 });
    }

    if (quietHours && (!quietHours.start || !quietHours.end)) {
      return NextResponse.json({
        success: false,
        error: 'quietHours must include start and end times',
      }, { status: 400 });
    }

    const throttleOptions: BandwidthThrottleOptions = {
      ...(maxBytesPerSecond !== undefined && { maxBytesPerSecond }),
      adaptiveThrottling,
      ...(quietHours && { quietHours })
    };

    const uploader = AdvancedUploader.getInstance();
    uploader.setBandwidthThrottle(throttleOptions);

    return NextResponse.json({
      success: true,
      message: 'Bandwidth throttling configured',
      settings: throttleOptions,
    });

  } catch (error) {
    console.error('Throttle configuration error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to configure bandwidth throttling',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/upload/throttle - Get current throttling settings
 */
export async function GET(request: NextRequest) {
  try {
    const uploader = AdvancedUploader.getInstance();
    const analytics = uploader.getAnalytics();

    return NextResponse.json({
      success: true,
      currentBandwidthUsage: analytics.bandwidthUsage,
      averageSpeed: analytics.averageSpeed,
      // Note: In a real implementation, you'd store and return actual throttle settings
      currentThrottleSettings: {
        message: 'Throttle settings would be stored and returned here'
      },
    });

  } catch (error) {
    console.error('Get throttle settings error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get throttle settings',
    }, { status: 500 });
  }
}
