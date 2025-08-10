import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { SessionService } from '@/lib/db';
// Initialize WebSocket polyfills early
import '@/lib/init-websocket';

/**
 * GET /api/auth/status - Check WhatsApp connection status
 */
export async function GET(request: NextRequest) {
  try {
    const baileysManager = getBaileysManager();
    let connectionStatus = baileysManager.getConnectionStatus();
    
    // If not initialized yet, try to initialize connection
    if (connectionStatus.status === 'disconnected') {
      console.log('Connection not initialized, attempting to initialize...');
      try {
        // Check for existing active session first
        const activeSession = await SessionService.getActive();
        if (activeSession) {
          await baileysManager.initialize(activeSession.id);
        } else {
          await baileysManager.initialize();
        }
        connectionStatus = baileysManager.getConnectionStatus();
      } catch (initError) {
        console.error('Failed to auto-initialize connection:', initError);
        // Continue with current status
      }
    }
    
    // Get session info from database if connected
    let sessionInfo = null;
    if (connectionStatus.status === 'connected') {
      const activeSession = await SessionService.getActive();
      if (activeSession) {
        sessionInfo = {
          id: activeSession.id,
          deviceName: activeSession.deviceName,
          createdAt: activeSession.createdAt,
          lastSeenAt: activeSession.lastSeenAt,
        };
      }
    }
    
    return NextResponse.json({
      success: true,
      status: connectionStatus.status,
      session: sessionInfo,
      whatsappUser: connectionStatus.session,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to check connection status',
    }, { status: 500 });
  }
}

/**
 * POST /api/auth/status - Update connection status or force reconnect
 */
export async function POST(request: NextRequest) {
  try {
    const { action, sessionId } = await request.json();
    const baileysManager = getBaileysManager();
    
    switch (action) {
      case 'reconnect':
        await baileysManager.disconnect();
        await new Promise(resolve => setTimeout(resolve, 1000));
        const status = await baileysManager.initialize(sessionId);
        
        return NextResponse.json({
          success: true,
          message: 'Reconnection initiated',
          status: status.status,
        });
        
      case 'refresh':
        const currentStatus = baileysManager.getConnectionStatus();
        return NextResponse.json({
          success: true,
          status: currentStatus.status,
        });
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Supported actions: reconnect, refresh',
        }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Status update error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update connection status',
    }, { status: 500 });
  }
}
