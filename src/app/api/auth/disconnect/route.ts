import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { SessionService } from '@/lib/db';
// Initialize WebSocket polyfills early
import '@/lib/init-websocket';

/**
 * POST /api/auth/disconnect - Disconnect WhatsApp session
 */
export async function POST(request: NextRequest) {
  try {
    const baileysManager = getBaileysManager();
    const body = await request.json().catch(() => ({}));
    const { sessionId, permanently = false } = body;
    
    // Disconnect from WhatsApp
    await baileysManager.disconnect();
    
    if (permanently && sessionId) {
      // Permanently delete session from database
      await SessionService.delete(sessionId);
      
      return NextResponse.json({
        success: true,
        message: 'Session disconnected and permanently deleted',
        action: 'permanent_disconnect',
      });
    } else {
      // Just mark as inactive but keep in database
      const activeSession = await SessionService.getActive();
      if (activeSession) {
        await SessionService.update(activeSession.id, {
          isActive: false,
          lastSeenAt: new Date(),
        });
      }
      
      return NextResponse.json({
        success: true,
        message: 'Session disconnected',
        action: 'disconnect',
      });
    }
    
  } catch (error) {
    console.error('Disconnect error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to disconnect session',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/disconnect - Force disconnect and cleanup
 */
export async function DELETE(_request: NextRequest) {
  try {
    const baileysManager = getBaileysManager();
    
    // Force disconnect
    await baileysManager.disconnect();
    
    // Deactivate all sessions
    await SessionService.deactivateAll();
    
    return NextResponse.json({
      success: true,
      message: 'All sessions disconnected and deactivated',
      action: 'force_disconnect',
    });
    
  } catch (error) {
    console.error('Force disconnect error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to force disconnect',
    }, { status: 500 });
  }
}
