import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { SendTargetingManager, SendTarget, MultiSendOptions } from '@/lib/socketManager/SendTargetingManager';

let sendTargetingManager: SendTargetingManager | null = null;

function getSendTargetingManager() {
  const baileysManager = getBaileysManager();
  const socket = baileysManager.getSocket();
  
  if (!socket) {
    throw new Error('WhatsApp not connected');
  }
  
  if (!sendTargetingManager) {
    sendTargetingManager = new SendTargetingManager(socket);
  }
  
  return sendTargetingManager;
}

/**
 * POST /api/send/multi - Send to multiple targets or get send confirmation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      action = 'send',
      targets,
      files,
      caption,
      sendAsDocument = false,
      intervalBetween = 2000,
      confirmBeforeSend = true,
      retryFailures = true,
      maxRetries = 2
    } = body;

    // Check connection
    const baileysManager = getBaileysManager();
    const connectionStatus = baileysManager.getConnectionStatus();
    
    if (connectionStatus.status !== 'connected') {
      return NextResponse.json({
        success: false,
        error: 'WhatsApp is not connected',
        currentStatus: connectionStatus.status,
      }, { status: 400 });
    }

    // Validate required fields
    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'targets array is required and must not be empty',
      }, { status: 400 });
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'files array is required and must not be empty',
      }, { status: 400 });
    }

    // Validate targets format
    const validatedTargets: SendTarget[] = targets.map((target, index) => {
      if (!target.id || !target.type || !target.name || !target.recipient) {
        throw new Error(`Invalid target format at index ${index}`);
      }
      return target as SendTarget;
    });

    const manager = getSendTargetingManager();

    const sendOptions: MultiSendOptions = {
      targets: validatedTargets,
      files,
      caption,
      sendAsDocument,
      intervalBetween,
      confirmBeforeSend,
      retryFailures,
      maxRetries,
    };

    if (action === 'confirm') {
      // Get send confirmation dialog data
      const confirmation = await manager.createSendConfirmation(sendOptions);
      
      return NextResponse.json({
        success: true,
        action: 'confirmation',
        confirmation: {
          targets: confirmation.targets.map(t => ({
            id: t.id,
            type: t.type,
            name: t.name,
            canSend: t.canSend,
          })),
          filesCount: confirmation.files.length,
          caption: confirmation.caption,
          estimatedTime: confirmation.estimatedTime,
          estimatedTimeFormatted: formatDuration(confirmation.estimatedTime),
          warnings: confirmation.warnings,
          totalRecipients: confirmation.totalRecipients,
          requiresConfirmation: confirmation.requiresConfirmation,
        },
      });

    } else if (action === 'send') {
      // Execute the multi-send
      const result = await manager.sendToMultiple(sendOptions);

      return NextResponse.json({
        success: true,
        action: 'sent',
        result: {
          id: result.id,
          totalTargets: result.totalTargets,
          successful: result.successful.length,
          failed: result.failed.length,
          skipped: result.skipped.length,
          duration: result.duration,
          durationFormatted: formatDuration(result.duration),
          successRate: ((result.successful.length / result.totalTargets) * 100).toFixed(1),
          summary: {
            successful: result.successful.map(s => ({
              target: s.target.name,
              messageId: s.messageId,
              sentAt: s.sentAt,
            })),
            failed: result.failed.map(f => ({
              target: f.target.name,
              error: f.error,
              attemptedAt: f.attemptedAt,
            })),
            skipped: result.skipped.map(s => ({
              target: s.target.name,
              reason: s.reason,
            })),
          },
        },
      });

    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid action. Must be "confirm" or "send"',
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Multi-send error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process multi-send request',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/send/multi - Get multi-send statistics
 */
export async function GET(request: NextRequest) {
  try {
    // Check connection
    const baileysManager = getBaileysManager();
    const connectionStatus = baileysManager.getConnectionStatus();
    
    if (connectionStatus.status !== 'connected') {
      return NextResponse.json({
        success: false,
        error: 'WhatsApp is not connected',
        currentStatus: connectionStatus.status,
      }, { status: 400 });
    }

    const manager = getSendTargetingManager();
    const statistics = manager.getSendStatistics();

    return NextResponse.json({
      success: true,
      statistics: {
        activeMultiSends: statistics.activeMultiSends,
        broadcastLists: statistics.broadcastLists,
        scheduledSends: {
          active: statistics.activeScheduledSends,
          completed: statistics.completedScheduledSends,
          failed: statistics.failedScheduledSends,
          upcoming: statistics.upcomingScheduledSends,
        },
      },
    });

  } catch (error) {
    console.error('Get multi-send statistics error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get multi-send statistics',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * Helper function to format duration in milliseconds to human readable format
 */
function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
