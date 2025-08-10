import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { SendTargetingManager, SendTarget, ScheduledSend } from '@/lib/socketManager/SendTargetingManager';

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
 * POST /api/send/schedule - Schedule a send
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      targets,
      files,
      scheduledTime,
      caption,
      intervalBetween = 2000
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

    if (!scheduledTime) {
      return NextResponse.json({
        success: false,
        error: 'scheduledTime is required',
      }, { status: 400 });
    }

    // Validate scheduled time
    const scheduledDate = new Date(scheduledTime);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({
        success: false,
        error: 'Invalid scheduledTime format',
      }, { status: 400 });
    }

    if (scheduledDate <= new Date()) {
      return NextResponse.json({
        success: false,
        error: 'scheduledTime must be in the future',
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

    const scheduledSend = await manager.scheduleSend(
      validatedTargets,
      files,
      scheduledDate,
      { caption, intervalBetween }
    );

    return NextResponse.json({
      success: true,
      message: 'Send scheduled successfully',
      scheduledSend: {
        id: scheduledSend.id,
        targetsCount: scheduledSend.targets.length,
        filesCount: scheduledSend.files.length,
        scheduledTime: scheduledSend.scheduledTime,
        timeUntilSend: scheduledSend.scheduledTime.getTime() - Date.now(),
        status: scheduledSend.status,
        createdAt: scheduledSend.createdAt,
        caption: scheduledSend.caption,
        intervalBetween: scheduledSend.intervalBetween,
      },
    });

  } catch (error) {
    console.error('Schedule send error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to schedule send',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/send/schedule - Get scheduled sends
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') as ScheduledSend['status'] | null;

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
    const scheduledSends = manager.getScheduledSends(statusFilter || undefined);
    const statistics = manager.getSendStatistics();

    const now = new Date();

    return NextResponse.json({
      success: true,
      scheduledSends: scheduledSends.map(send => ({
        id: send.id,
        targetsCount: send.targets.length,
        filesCount: send.files.length,
        scheduledTime: send.scheduledTime,
        timeUntilSend: send.status === 'pending' ? 
          Math.max(0, send.scheduledTime.getTime() - now.getTime()) : null,
        status: send.status,
        createdAt: send.createdAt,
        processedAt: send.processedAt,
        completedAt: send.completedAt,
        caption: send.caption,
        intervalBetween: send.intervalBetween,
        errors: send.errors,
        targetNames: send.targets.map(t => t.name).slice(0, 5), // First 5 target names
        hasMoreTargets: send.targets.length > 5,
      })),
      statistics: {
        total: scheduledSends.length,
        pending: statistics.activeScheduledSends,
        completed: statistics.completedScheduledSends,
        failed: statistics.failedScheduledSends,
        upcoming: statistics.upcomingScheduledSends,
      },
      filter: statusFilter,
    });

  } catch (error) {
    console.error('Get scheduled sends error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get scheduled sends',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/send/schedule - Cancel scheduled send
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sendId = searchParams.get('sendId');

    if (!sendId) {
      return NextResponse.json({
        success: false,
        error: 'sendId parameter is required',
      }, { status: 400 });
    }

    const manager = getSendTargetingManager();
    const cancelled = await manager.cancelScheduledSend(sendId);

    if (!cancelled) {
      return NextResponse.json({
        success: false,
        error: 'Scheduled send not found or cannot be cancelled',
        sendId,
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Scheduled send cancelled successfully',
      sendId,
    });

  } catch (error) {
    console.error('Cancel scheduled send error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to cancel scheduled send',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
