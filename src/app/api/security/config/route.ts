import { NextRequest, NextResponse } from 'next/server';
import { getSecurityMonitor } from '@/lib/security/SecurityMonitor';
import { DEFAULT_ENCRYPTION_CONFIG } from '@/lib/db/crypto';

/**
 * GET /api/security/config - Get security configuration
 */
export async function GET() {
  try {
    const securityMonitor = getSecurityMonitor();
    const securityConfig = securityMonitor.getConfig();

    return NextResponse.json({
      success: true,
      security: securityConfig,
      encryption: DEFAULT_ENCRYPTION_CONFIG
    });

  } catch (error) {
    console.error('Failed to get security config:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get security configuration'
    }, { status: 500 });
  }
}

/**
 * POST /api/security/config - Update security configuration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { security, encryption } = body;

    if (!security) {
      return NextResponse.json({
        success: false,
        error: 'Security configuration is required'
      }, { status: 400 });
    }

    const securityMonitor = getSecurityMonitor();
    securityMonitor.updateConfig(security);

    // Log the configuration change
    await securityMonitor.logSecurityEvent({
      type: 'configuration',
      severity: 'medium',
      source: 'API',
      description: 'Security configuration updated via API',
      metadata: {
        updatedFields: Object.keys(security),
        hasEncryptionConfig: !!encryption
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Security configuration updated successfully'
    });

  } catch (error) {
    console.error('Failed to update security config:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update security configuration'
    }, { status: 500 });
  }
}
