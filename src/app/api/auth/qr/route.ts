import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
// Initialize WebSocket polyfills early
import '@/lib/init-websocket';

/**
 * GET /api/auth/qr - Get current QR code for WhatsApp authentication
 */
export async function GET(request: NextRequest) {
  try {
    const baileysManager = getBaileysManager();
    
    // Get current status and QR code
    const status = baileysManager.getConnectionStatus();
    const qrCode = baileysManager.getCurrentQRCode();
    
    if (status.status === 'connected') {
      return NextResponse.json({
        success: true,
        message: 'Already connected to WhatsApp',
        status: status.status,
        session: status.session,
      });
    }
    
    if (status.status === 'qr_required' && qrCode) {
      return NextResponse.json({
        success: true,
        qrCode: qrCode,
        status: status.status,
      });
    }
    
    if (status.status === 'error') {
      return NextResponse.json({
        success: false,
        error: status.error || 'Connection error occurred',
        status: status.status,
      }, { status: 500 });
    }
    
    // If no QR code available yet, return current status
    return NextResponse.json({
      success: true,
      message: 'Waiting for QR code generation...',
      status: status.status,
    });
    
  } catch (error) {
    console.error('QR retrieval error:', error);
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
    
    // Check socket state before attempting disconnect
    const socketState = baileysManager.getSocketState();
    console.log('Current socket state before disconnect:', socketState);
    
    // Only disconnect if socket exists and is not already closed
    if (socketState !== 'not_initialized' && socketState !== 'closed') {
      console.log('Disconnecting existing connection...');
      await baileysManager.disconnect();
      
      // Wait for disconnect to complete
      await new Promise(resolve => setTimeout(resolve, 2000)); // Increased wait time
    } else {
      console.log('No active connection to disconnect');
    }
    
    // Initialize new connection
    console.log('Initializing new connection with enhanced settings...');
    await baileysManager.initialize();
    
    // Wait a bit for QR code generation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get the status after initialization
    const status = baileysManager.getConnectionStatus();
    const qrCode = baileysManager.getCurrentQRCode();
    
    return NextResponse.json({
      success: true,
      status: status.status,
      qrCode: qrCode,
      message: status.status === 'connecting' ? 'Connection started, QR code will be available shortly...' : 
               status.status === 'qr_required' ? 'QR code generated successfully!' : undefined,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('QR regeneration error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to regenerate QR code',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
