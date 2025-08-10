import { NextRequest, NextResponse } from 'next/server';
import { getSecurityMonitor } from '@/lib/security/SecurityMonitor';

/**
 * GET /api/security/events - Get security events
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24');
    const severity = searchParams.get('severity') || undefined;

    const securityMonitor = getSecurityMonitor();
    const events = await securityMonitor.getRecentEvents(severity, hours);

    return NextResponse.json(events);

  } catch (error) {
    console.error('Failed to get security events:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get security events'
    }, { status: 500 });
  }
}
