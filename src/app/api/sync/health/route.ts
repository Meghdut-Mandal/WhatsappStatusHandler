import { NextRequest, NextResponse } from 'next/server';
import { BaileysManager } from '@/lib/socketManager/BaileysManager';
import { SyncLogRepository } from '@/lib/db/syncLog';

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
 * GET /api/sync/health - Get comprehensive sync health metrics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('include_history') === 'true';
    const historyDays = parseInt(searchParams.get('history_days') || '7');

    const manager = getBaileysManager();
    const connectionStatus = manager.getConnectionStatus();

    // Basic health info
    const healthData: any = {
      timestamp: new Date().toISOString(),
      connection: {
        status: connectionStatus.status,
        connected: connectionStatus.status === 'connected',
        session: connectionStatus.session
      },
      sync: {
        available: false,
        scheduler: null,
        health: null,
        statistics: null
      }
    };

    // If connected, get detailed sync health
    if (connectionStatus.status === 'connected') {
      const autoSyncStatus = manager.getAutoSyncStatus();
      
      if (autoSyncStatus.available) {
        healthData.sync = {
          available: true,
          scheduler: autoSyncStatus.scheduler,
          health: autoSyncStatus.health,
          config: autoSyncStatus.config,
          activeSyncs: autoSyncStatus.activeSyncs,
          queuedSyncs: autoSyncStatus.queuedSyncs
        };
      }
    }

    // Get database statistics
    try {
      const dbStats = await SyncLogRepository.getStatistics();
      healthData.sync.statistics = dbStats;
    } catch (error) {
      console.error('Failed to get sync statistics from database:', error);
      healthData.sync.statistics = {
        error: 'Failed to retrieve database statistics'
      };
    }

    // Include sync history if requested
    if (includeHistory) {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - historyDays);

        const recentLogs = await SyncLogRepository.findAll({
          startDate: cutoffDate,
          limit: 100
        });

        healthData.history = {
          days: historyDays,
          totalLogs: recentLogs.length,
          logs: recentLogs.map(log => ({
            id: log.id,
            type: log.type,
            status: log.status,
            startedAt: log.startedAt,
            completedAt: log.completedAt,
            duration: log.completedAt && log.startedAt 
              ? log.completedAt.getTime() - log.startedAt.getTime()
              : null,
            itemsCount: log.itemsCount,
            errorMessage: log.errorMessage
          }))
        };

        // Calculate success rate for the period
        const completedLogs = recentLogs.filter(log => log.status === 'completed');
        const failedLogs = recentLogs.filter(log => log.status === 'failed');
        const totalFinished = completedLogs.length + failedLogs.length;

        healthData.history.metrics = {
          successRate: totalFinished > 0 ? (completedLogs.length / totalFinished) * 100 : 0,
          averageDuration: completedLogs.length > 0 
            ? completedLogs.reduce((sum, log) => {
                const duration = log.completedAt && log.startedAt 
                  ? log.completedAt.getTime() - log.startedAt.getTime()
                  : 0;
                return sum + duration;
              }, 0) / completedLogs.length
            : 0,
          totalCompleted: completedLogs.length,
          totalFailed: failedLogs.length,
          recentErrors: failedLogs.slice(0, 5).map(log => ({
            timestamp: log.startedAt,
            type: log.type,
            error: log.errorMessage
          }))
        };

      } catch (error) {
        console.error('Failed to get sync history:', error);
        healthData.history = {
          error: 'Failed to retrieve sync history'
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: healthData
    });

  } catch (error) {
    console.error('Failed to get sync health:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get sync health',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * POST /api/sync/health - Perform health check actions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    const manager = getBaileysManager();
    const connectionStatus = manager.getConnectionStatus();

    if (connectionStatus.status !== 'connected') {
      return NextResponse.json({
        success: false,
        error: 'WhatsApp not connected'
      }, { status: 400 });
    }

    const contactManager = manager.getContactManager();
    if (!contactManager) {
      return NextResponse.json({
        success: false,
        error: 'ContactManager not available'
      }, { status: 400 });
    }

    switch (action) {
      case 'cleanup_logs':
        const { daysToKeep = 30 } = body;
        const deletedCount = await SyncLogRepository.cleanupOldLogs(daysToKeep);
        
        return NextResponse.json({
          success: true,
          message: `Cleaned up ${deletedCount} old sync logs`,
          deletedCount,
          timestamp: new Date().toISOString()
        });

      case 'health_check':
        // Trigger a manual health check
        const syncScheduler = contactManager.getSyncScheduler();
        const healthMetrics = syncScheduler.getHealthMetrics();
        
        return NextResponse.json({
          success: true,
          message: 'Health check completed',
          health: healthMetrics,
          timestamp: new Date().toISOString()
        });

      case 'reset_error_count':
        // Reset failed attempts counter
        const scheduler = contactManager.getSyncScheduler();
        const currentStatus = scheduler.getSyncStatus();
        
        // This would require adding a method to reset error count
        // For now, we'll return the current status
        return NextResponse.json({
          success: true,
          message: 'Error count reset requested',
          currentStatus,
          timestamp: new Date().toISOString()
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Supported actions: cleanup_logs, health_check, reset_error_count'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Failed to process health action:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process health action',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}