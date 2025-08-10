import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { SessionService } from '@/lib/db';

/**
 * POST /api/send/group - Send media to specific WhatsApp group
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files, caption, groupId, sessionId } = body;

    // Validate required fields
    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Files array is required and must not be empty',
      }, { status: 400 });
    }

    if (!groupId) {
      return NextResponse.json({
        success: false,
        error: 'Group ID is required',
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
    
    // Validate target group
    const isValidTarget = await messageSender.validateTarget('group', groupId);
    if (!isValidTarget) {
      return NextResponse.json({
        success: false,
        error: 'Group not found or not accessible',
      }, { status: 400 });
    }
    
    // Send to group
    const result = await messageSender.sendToGroup({
      sessionId: activeSessionId,
      targetType: 'group',
      targetIdentifier: groupId,
      files,
      caption,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Media sent to group successfully',
        result: {
          messageId: result.messageId,
          sentAt: result.sentAt,
          filesCount: files.length,
          groupId,
          caption,
        },
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to send to group',
        details: result.error,
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Group send error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/send/group - Get available groups and sending capabilities
 */
export async function GET(request: NextRequest) {
  try {
    // Check connection status
    const baileysManager = getBaileysManager();
    const connectionStatus = baileysManager.getConnectionStatus();
    
    const canSend = connectionStatus.status === 'connected';
    let groups = [];
    
    if (canSend) {
      try {
        const messageSender = baileysManager.getMessageSender();
        groups = await messageSender.getGroups();
      } catch (error) {
        console.error('Failed to get groups:', error);
        // Continue without groups
      }
    }
    
    // Get recent group sends
    const { SendHistoryService } = await import('@/lib/db');
    const activeSession = await SessionService.getActive();
    
    let recentSends: any[] = [];
    if (activeSession) {
      recentSends = await SendHistoryService.getBySessionId(activeSession.id, {
        limit: 10,
      });
      
      // Filter for group sends only
      recentSends = recentSends
        .filter(send => send.targetType === 'group')
        .map(send => ({
          id: send.id,
          groupId: send.targetIdentifier,
          filesCount: Array.isArray(send.files) ? send.files.length : 0,
          sentAt: send.completedAt || send.createdAt,
          status: send.status,
        }));
    }

    return NextResponse.json({
      success: true,
      capabilities: {
        canSend,
        connectionStatus: connectionStatus.status,
        whatsappUser: connectionStatus.session,
      },
      groups: groups.map((group: any) => ({
        id: group.id,
        name: group.subject,
        description: group.description,
        participantsCount: group.participantsCount,
        isOwner: group.owner === connectionStatus.session?.id,
      })),
      recentSends,
    });

  } catch (error) {
    console.error('Group capabilities error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get group sending capabilities',
    }, { status: 500 });
  }
}
