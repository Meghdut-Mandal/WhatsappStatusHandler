import { NextResponse } from 'next/server';
import { generateEncryptionKey } from '@/lib/db/crypto';
import { getSecurityMonitor } from '@/lib/security/SecurityMonitor';

/**
 * POST /api/security/generate-key - Generate new encryption key
 */
export async function POST() {
  try {
    const newKey = generateEncryptionKey();
    
    // Log the key generation
    const securityMonitor = getSecurityMonitor();
    await securityMonitor.logSecurityEvent({
      type: 'encryption',
      severity: 'medium',
      source: 'API',
      description: 'New encryption key generated',
      metadata: {
        keyLength: newKey.length,
        timestamp: new Date().toISOString()
      }
    });

    return NextResponse.json({
      success: true,
      key: newKey,
      message: 'New encryption key generated successfully'
    });

  } catch (error) {
    console.error('Failed to generate encryption key:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate encryption key'
    }, { status: 500 });
  }
}
