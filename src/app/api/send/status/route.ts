import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { SessionService } from '@/lib/db';

/**
 * POST /api/send/status - Send media to WhatsApp Status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files, caption, sessionId } = body;

    // Validate required fields
    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Files array is required and must not be empty',
      }, { status: 400 });
    }

    // Get or determine session ID
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const activeSession = await SessionService.getActive();
      if (!activeSession) {
        return NextResponse.json({
          success: false,
          error: 'No active WhatsApp session found. Please connect first.',
        }, { status: 400 });
      }
      activeSessionId = activeSession.id;
    }

    // Get Baileys manager and check connection
    const baileysManager = getBaileysManager();
    const connectionStatus = baileysManager.getConnectionStatus();
    
    if (connectionStatus.status !== 'connected') {
      return NextResponse.json({
        success: false,
        error: 'WhatsApp is not connected. Please connect first.',
        currentStatus: connectionStatus.status,
      }, { status: 400 });
    }

    // Get message sender
    const messageSender = baileysManager.getMessageSender();
    
    // Send to status
    const result = await messageSender.sendToStatus({
      sessionId: activeSessionId,
      targetType: 'status',
      files,
      caption,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Media sent to WhatsApp Status successfully',
        result: {
          messageId: result.messageId,
          sentAt: result.sentAt,
          filesCount: files.length,
          caption,
        },
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to send to WhatsApp Status',
        details: result.error,
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Status send error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/send/status - Get status sending capabilities and recent sends
 */
export async function GET(request: NextRequest) {
  try {
    // Check connection status
    const baileysManager = getBaileysManager();
    const connectionStatus = baileysManager.getConnectionStatus();
    
    const canSend = connectionStatus.status === 'connected';
    
    // Get recent status sends
    const { SendHistoryService } = await import('@/lib/db');
    const activeSession = await SessionService.getActive();
    
    let recentSends = [];
    if (activeSession) {
      recentSends = await SendHistoryService.getBySessionId(activeSession.id, {
        limit: 10,
        status: 'completed',
      });
      
      // Filter for status sends only
      recentSends = recentSends.filter(send => send.targetType === 'status');
    }

    return NextResponse.json({
      success: true,
      capabilities: {
        canSend,
        connectionStatus: connectionStatus.status,
        whatsappUser: connectionStatus.session,
      },
      recentSends: recentSends.map(send => ({
        id: send.id,
        filesCount: Array.isArray(send.files) ? send.files.length : 0,
        sentAt: send.completedAt,
        status: send.status,
      })),
    });

  } catch (error) {
    console.error('Status capabilities error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get status sending capabilities',
    }, { status: 500 });
  }
}
