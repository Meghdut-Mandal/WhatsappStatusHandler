import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
// Initialize WebSocket polyfills early
import '@/lib/init-websocket';

/**
 * GET /api/auth/qr - Get current QR code for WhatsApp authentication
 */
export async function GET(_request: NextRequest) {
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
export async function POST(_request: NextRequest) {
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
    
    try {
      // Wait for QR code generation using event-based approach
      console.log('Waiting for QR code generation...');
      const qrCode = await baileysManager.waitForQRCode(15000); // 15 second timeout
      
      console.log('QR code generated successfully via event');
      return NextResponse.json({
        success: true,
        status: 'qr_required',
        qrCode: qrCode,
        message: 'QR code generated successfully!',
        timestamp: new Date().toISOString(),
      });
      
    } catch (qrError) {
      console.warn('QR code wait failed:', qrError.message);
      
      // Fallback: check current status one more time
      const status = baileysManager.getConnectionStatus();
      const qrCode = baileysManager.getCurrentQRCode();
      
      // If we actually have a QR code despite the timeout, return it
      if (qrCode) {
        console.log('QR code available despite timeout');
        return NextResponse.json({
          success: true,
          status: status.status,
          qrCode: qrCode,
          message: 'QR code generated successfully!',
          timestamp: new Date().toISOString(),
        });
      }
      
      // Check if already connected
      if (status.status === 'connected') {
        return NextResponse.json({
          success: true,
          message: 'Already connected to WhatsApp',
          status: status.status,
          timestamp: new Date().toISOString(),
        });
      }
      
      // Return partial success - connection started but QR not ready yet
      return NextResponse.json({
        success: true, // Don't fail completely, QR might come later
        status: status.status,
        qrCode: null,
        message: 'Connection started. QR code will be available shortly. Please try refreshing in a moment.',
        timeout: true,
        timestamp: new Date().toISOString(),
      });
    }
    
  } catch (error) {
    console.error('QR regeneration error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to regenerate QR code',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
