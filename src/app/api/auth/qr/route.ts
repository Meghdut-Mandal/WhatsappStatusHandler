import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';

/**
 * GET /api/auth/qr - Generate QR code for WhatsApp authentication
 */
export async function GET(request: NextRequest) {
  try {
    const baileysManager = getBaileysManager();
    
    // Initialize connection to get QR code
    const status = await baileysManager.initialize();
    
    if (status.status === 'qr_required' && status.qrCode) {
      return NextResponse.json({
        success: true,
        qrCode: status.qrCode,
        status: status.status,
      });
    }
    
    if (status.status === 'connected') {
      return NextResponse.json({
        success: true,
        message: 'Already connected to WhatsApp',
        status: status.status,
        session: status.session,
      });
    }
    
    if (status.status === 'error') {
      return NextResponse.json({
        success: false,
        error: status.error || 'Failed to initialize connection',
        status: status.status,
      }, { status: 500 });
    }
    
    // Connection is in progress
    return NextResponse.json({
      success: true,
      message: 'Connection in progress, please wait...',
      status: status.status,
    });
    
  } catch (error) {
    console.error('QR generation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}

/**
 * POST /api/auth/qr - Force regenerate QR code
 */
export async function POST(request: NextRequest) {
  try {
    const baileysManager = getBaileysManager();
    
    // Disconnect if already connected and force new connection
    await baileysManager.disconnect();
    
    // Wait a moment before reconnecting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const status = await baileysManager.initialize();
    
    return NextResponse.json({
      success: true,
      status: status.status,
      qrCode: status.qrCode,
    });
    
  } catch (error) {
    console.error('QR regeneration error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to regenerate QR code',
    }, { status: 500 });
  }
}
