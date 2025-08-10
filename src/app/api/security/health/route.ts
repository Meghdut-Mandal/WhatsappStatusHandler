import { NextResponse } from 'next/server';
import { getSecurityMonitor } from '@/lib/security/SecurityMonitor';

/**
 * GET /api/security/health - Get security health status
 */
export async function GET() {
  try {
    const securityMonitor = getSecurityMonitor();
    const healthStatus = await securityMonitor.getSecurityHealth();

    return NextResponse.json(healthStatus);

  } catch (error) {
    console.error('Failed to get security health:', error);
    return NextResponse.json({
      status: 'critical',
      checks: [{
        name: 'Health Check',
        status: 'fail',
        message: 'Failed to perform security health check'
      }]
    }, { status: 500 });
  }
}
