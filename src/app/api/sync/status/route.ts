import { NextRequest, NextResponse } from 'next/server';
import { BaileysManager } from '@/lib/socketManager/BaileysManager';

// Global BaileysManager instance (should be managed by a singleton or service)
let baileysManager: BaileysManager | null = null;

// Initialize BaileysManager if not already done
function getBaileysManager(): BaileysManager {
  if (!baileysManager) {
    baileysManager = new BaileysManager();
  }
  return baileysManager;
}

/**
 * GET /api/sync/status - Get current sync status and health metrics
 */
export async function GET(request: NextRequest) {
  try {
    const manager = getBaileysManager();
    const connectionStatus = manager.getConnectionStatus();

    // If not connected, return basic status
    if (connectionStatus.status !== 'connected') {
      return NextResponse.json({
        success: true,
        data: {
          connected: false,
          connectionStatus: connectionStatus.status,
          autoSync: {
            available: false,
            reason: 'WhatsApp not connected'
          }
        }
      });
    }

    // Get detailed sync status
    const autoSyncStatus = manager.getAutoSyncStatus();
    const contactManager = manager.getContactManager();

    let syncStatus = null;
    if (contactManager) {
      syncStatus = contactManager.getSyncStatus();
    }

    return NextResponse.json({
      success: true,
      data: {
        connected: true,
        connectionStatus: connectionStatus.status,
        session: connectionStatus.session,
        autoSync: autoSyncStatus,
        currentSync: syncStatus,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Failed to get sync status:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get sync status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * POST /api/sync/status - Trigger manual sync or update sync configuration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, type, config } = body;

    const manager = getBaileysManager();
    const connectionStatus = manager.getConnectionStatus();

    if (connectionStatus.status !== 'connected') {
      return NextResponse.json({
        success: false,
        error: 'WhatsApp not connected'
      }, { status: 400 });
    }

    switch (action) {
      case 'trigger_sync':
        const syncType = type || 'full';
        if (!['full', 'incremental'].includes(syncType)) {
          return NextResponse.json({
            success: false,
            error: 'Invalid sync type. Must be "full" or "incremental"'
          }, { status: 400 });
        }

        await manager.triggerManualSync(syncType);
        return NextResponse.json({
          success: true,
          message: `${syncType} sync triggered successfully`,
          timestamp: new Date().toISOString()
        });

      case 'update_config':
        if (!config || typeof config !== 'object') {
          return NextResponse.json({
            success: false,
            error: 'Config object required for update_config action'
          }, { status: 400 });
        }

        manager.updateSyncConfig(config);
        return NextResponse.json({
          success: true,
          message: 'Sync configuration updated successfully',
          timestamp: new Date().toISOString()
        });

      case 'stop_sync':
        const contactManager = manager.getContactManager();
        if (contactManager) {
          contactManager.stopAutoSync();
        }
        return NextResponse.json({
          success: true,
          message: 'Automatic sync stopped',
          timestamp: new Date().toISOString()
        });

      case 'force_stop':
        const contactManagerForce = manager.getContactManager();
        if (contactManagerForce) {
          contactManagerForce.forceStopAllSyncs();
        }
        return NextResponse.json({
          success: true,
          message: 'All sync operations force stopped',
          timestamp: new Date().toISOString()
        });

      case 'clear_queue':
        const contactManagerQueue = manager.getContactManager();
        if (contactManagerQueue) {
          contactManagerQueue.clearSyncQueue();
        }
        return NextResponse.json({
          success: true,
          message: 'Sync queue cleared',
          timestamp: new Date().toISOString()
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Supported actions: trigger_sync, update_config, stop_sync, force_stop, clear_queue'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Failed to process sync action:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process sync action',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}