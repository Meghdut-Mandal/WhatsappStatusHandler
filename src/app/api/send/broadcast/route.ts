import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { SendTargetingManager, SendTarget } from '@/lib/socketManager/SendTargetingManager';

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
 * POST /api/send/broadcast - Create broadcast list or send to broadcast list
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, listId, name, description, recipients, files, caption } = body;

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

    if (action === 'create') {
      // Create new broadcast list
      if (!name || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'name and recipients array are required for creating broadcast list',
        }, { status: 400 });
      }

      // Validate recipients format
      const validatedRecipients: SendTarget[] = recipients.map(recipient => {
        if (!recipient.id || !recipient.type || !recipient.name || !recipient.recipient) {
          throw new Error('Invalid recipient format');
        }
        return recipient as SendTarget;
      });

      const broadcastList = await manager.createBroadcastList(name, validatedRecipients, description);

      return NextResponse.json({
        success: true,
        message: 'Broadcast list created successfully',
        broadcastList: {
          id: broadcastList.id,
          name: broadcastList.name,
          description: broadcastList.description,
          recipientsCount: broadcastList.recipients.length,
          createdAt: broadcastList.createdAt,
        },
      });

    } else if (action === 'send') {
      // Send to existing broadcast list
      if (!listId || !files || !Array.isArray(files) || files.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'listId and files array are required for sending to broadcast list',
        }, { status: 400 });
      }

      const result = await manager.sendToBroadcastList(listId, files, caption);

      return NextResponse.json({
        success: true,
        message: 'Broadcast sent successfully',
        result: {
          id: result.id,
          totalTargets: result.totalTargets,
          successful: result.successful.length,
          failed: result.failed.length,
          skipped: result.skipped.length,
          duration: result.duration,
          failures: result.failed.map(f => ({
            target: f.target.name,
            error: f.error,
          })),
        },
      });

    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid action. Must be "create" or "send"',
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Broadcast operation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process broadcast operation',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/send/broadcast - Get broadcast lists
 */
export async function GET(_request: NextRequest) {
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
    const broadcastLists = manager.getBroadcastLists();
    const statistics = manager.getSendStatistics();

    return NextResponse.json({
      success: true,
      broadcastLists: broadcastLists.map(list => ({
        id: list.id,
        name: list.name,
        description: list.description,
        recipientsCount: list.recipients.length,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        isActive: list.isActive,
      })),
      statistics: {
        totalLists: statistics.broadcastLists,
        activeLists: broadcastLists.length,
      },
    });

  } catch (error) {
    console.error('Get broadcast lists error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get broadcast lists',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * PUT /api/send/broadcast - Update broadcast list
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { listId, name, description, recipients } = body;

    if (!listId) {
      return NextResponse.json({
        success: false,
        error: 'listId is required',
      }, { status: 400 });
    }

    const manager = getSendTargetingManager();
    
    const updates: {
      name?: string;
      description?: string;
      recipients?: string[];
    } = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (recipients !== undefined) updates.recipients = recipients;

    const updatedList = await manager.updateBroadcastList(listId, updates);

    if (!updatedList) {
      return NextResponse.json({
        success: false,
        error: 'Broadcast list not found',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Broadcast list updated successfully',
      broadcastList: {
        id: updatedList.id,
        name: updatedList.name,
        description: updatedList.description,
        recipientsCount: updatedList.recipients.length,
        updatedAt: updatedList.updatedAt,
      },
    });

  } catch (error) {
    console.error('Update broadcast list error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update broadcast list',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/send/broadcast - Delete broadcast list
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const listId = searchParams.get('listId');

    if (!listId) {
      return NextResponse.json({
        success: false,
        error: 'listId parameter is required',
      }, { status: 400 });
    }

    const manager = getSendTargetingManager();
    const deleted = await manager.deleteBroadcastList(listId);

    if (!deleted) {
      return NextResponse.json({
        success: false,
        error: 'Broadcast list not found',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Broadcast list deleted successfully',
      listId,
    });

  } catch (error) {
    console.error('Delete broadcast list error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete broadcast list',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
