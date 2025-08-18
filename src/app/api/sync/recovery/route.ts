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
 * GET /api/sync/recovery - Get recovery status and recommendations
 */
export async function GET(request: NextRequest) {
  try {
    const manager = getBaileysManager();
    const connectionStatus = manager.getConnectionStatus();

    if (connectionStatus.status !== 'connected') {
      return NextResponse.json({
        success: true,
        data: {
          connected: false,
          recoveryNeeded: false,
          message: 'WhatsApp not connected - recovery not applicable'
        }
      });
    }

    const contactManager = manager.getContactManager();
    if (!contactManager) {
      return NextResponse.json({
        success: false,
        error: 'ContactManager not available'
      }, { status: 400 });
    }

    // Get sync scheduler and monitor status
    const syncScheduler = contactManager.getSyncScheduler();
    const syncMonitor = contactManager.getSyncMonitor();
    
    const schedulerStatus = syncScheduler.getSyncStatus();
    const healthMetrics = syncScheduler.getHealthMetrics();
    const errorAnalysis = syncScheduler.getErrorAnalysis();
    const monitoringMetrics = syncMonitor.getMetrics();

    // Determine if recovery is needed
    const recoveryNeeded = schedulerStatus.failedAttempts > 0 || 
                          healthMetrics.status === 'critical' ||
                          errorAnalysis.criticalState;

    // Generate recovery recommendations
    const recommendations = [];
    
    if (schedulerStatus.failedAttempts > 0) {
      recommendations.push({
        type: 'reset_errors',
        priority: 'medium',
        description: 'Reset error counters to clear failed attempt state',
        action: 'POST /api/sync/recovery with action: reset_errors'
      });
    }

    if (healthMetrics.status === 'critical') {
      recommendations.push({
        type: 'emergency_recovery',
        priority: 'high',
        description: 'Perform emergency recovery to restore sync functionality',
        action: 'POST /api/sync/recovery with action: emergency_recovery'
      });
    }

    if (errorAnalysis.recentErrorRate > 50) {
      recommendations.push({
        type: 'connection_check',
        priority: 'high',
        description: 'Check WhatsApp connection stability and network connectivity',
        action: 'Manual verification required'
      });
    }

    if (syncScheduler.getActiveSyncs().length > 0) {
      recommendations.push({
        type: 'force_stop',
        priority: 'medium',
        description: 'Force stop stuck sync operations',
        action: 'POST /api/sync/recovery with action: force_stop'
      });
    }

    if (syncScheduler.getQueuedSyncs().length > 5) {
      recommendations.push({
        type: 'clear_queue',
        priority: 'low',
        description: 'Clear sync queue to prevent backlog',
        action: 'POST /api/sync/recovery with action: clear_queue'
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        connected: true,
        recoveryNeeded,
        status: {
          scheduler: {
            isRunning: schedulerStatus.isRunning,
            failedAttempts: schedulerStatus.failedAttempts,
            lastSyncAt: schedulerStatus.lastSyncAt,
            lastError: schedulerStatus.lastError?.message
          },
          health: {
            status: healthMetrics.status,
            successRate: healthMetrics.successRate,
            recentErrors: healthMetrics.recentErrors.length
          },
          monitoring: {
            systemHealth: monitoringMetrics.systemHealth,
            currentErrorRate: monitoringMetrics.currentErrorRate,
            activeAlerts: monitoringMetrics.activeAlerts.length
          },
          analysis: errorAnalysis
        },
        recommendations,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Failed to get recovery status:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get recovery status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * POST /api/sync/recovery - Perform recovery operations
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, force = false } = body;

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

    const syncScheduler = contactManager.getSyncScheduler();
    const syncMonitor = contactManager.getSyncMonitor();

    switch (action) {
      case 'reset_errors':
        // Reset error state in scheduler
        syncScheduler.resetErrorState();
        
        // Acknowledge all critical alerts
        const criticalAlerts = syncMonitor.getAlerts().filter(a => a.severity === 'critical');
        let acknowledgedCount = 0;
        for (const alert of criticalAlerts) {
          if (syncMonitor.acknowledgeAlert(alert.id)) {
            acknowledgedCount++;
          }
        }

        return NextResponse.json({
          success: true,
          message: 'Error state reset successfully',
          details: {
            errorsReset: true,
            alertsAcknowledged: acknowledgedCount
          },
          timestamp: new Date().toISOString()
        });

      case 'emergency_recovery':
        try {
          await syncScheduler.performEmergencyRecovery();
          
          return NextResponse.json({
            success: true,
            message: 'Emergency recovery completed successfully',
            timestamp: new Date().toISOString()
          });
        } catch (recoveryError) {
          return NextResponse.json({
            success: false,
            error: 'Emergency recovery failed',
            details: recoveryError instanceof Error ? recoveryError.message : 'Unknown error',
            timestamp: new Date().toISOString()
          }, { status: 500 });
        }

      case 'force_stop':
        // Force stop all active syncs
        contactManager.forceStopAllSyncs();
        
        return NextResponse.json({
          success: true,
          message: 'All sync operations force stopped',
          timestamp: new Date().toISOString()
        });

      case 'clear_queue':
        // Clear sync queue
        contactManager.clearSyncQueue();
        
        return NextResponse.json({
          success: true,
          message: 'Sync queue cleared',
          timestamp: new Date().toISOString()
        });

      case 'restart_scheduler':
        // Stop and restart the sync scheduler
        contactManager.stopAutoSync();
        
        // Wait a moment then reinitialize
        setTimeout(() => {
          // This would require a restart method on the scheduler
          // For now, we'll just emit an event
          contactManager.emit('scheduler_restart_requested');
        }, 1000);

        return NextResponse.json({
          success: true,
          message: 'Sync scheduler restart initiated',
          timestamp: new Date().toISOString()
        });

      case 'full_recovery':
        try {
          // Comprehensive recovery process
          console.log('Starting full recovery process...');
          
          // Step 1: Force stop all operations
          contactManager.forceStopAllSyncs();
          
          // Step 2: Clear queue
          contactManager.clearSyncQueue();
          
          // Step 3: Reset error state
          syncScheduler.resetErrorState();
          
          // Step 4: Clear old alerts
          const clearedAlerts = syncMonitor.clearOldAlerts(60 * 60 * 1000); // 1 hour
          
          // Step 5: Wait for stabilization
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Step 6: Attempt emergency recovery
          await syncScheduler.performEmergencyRecovery();
          
          return NextResponse.json({
            success: true,
            message: 'Full recovery process completed successfully',
            details: {
              operationsStopped: true,
              queueCleared: true,
              errorsReset: true,
              alertsCleared: clearedAlerts,
              emergencyRecoveryCompleted: true
            },
            timestamp: new Date().toISOString()
          });
          
        } catch (fullRecoveryError) {
          return NextResponse.json({
            success: false,
            error: 'Full recovery process failed',
            details: fullRecoveryError instanceof Error ? fullRecoveryError.message : 'Unknown error',
            timestamp: new Date().toISOString()
          }, { status: 500 });
        }

      case 'health_reset':
        // Reset health metrics and monitoring state
        syncScheduler.resetErrorState();
        syncMonitor.clearOldAlerts();
        
        return NextResponse.json({
          success: true,
          message: 'Health metrics reset successfully',
          timestamp: new Date().toISOString()
        });

      case 'test_recovery':
        // Test recovery capabilities without actually performing recovery
        const currentStatus = syncScheduler.getSyncStatus();
        const healthStatus = syncScheduler.getHealthMetrics();
        const errorAnalysis = syncScheduler.getErrorAnalysis();
        
        return NextResponse.json({
          success: true,
          message: 'Recovery test completed',
          testResults: {
            canResetErrors: currentStatus.failedAttempts > 0,
            needsEmergencyRecovery: errorAnalysis.criticalState,
            hasActiveSyncs: syncScheduler.getActiveSyncs().length > 0,
            hasQueuedSyncs: syncScheduler.getQueuedSyncs().length > 0,
            healthStatus: healthStatus.status,
            recommendations: errorAnalysis.recommendations
          },
          timestamp: new Date().toISOString()
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Supported actions: reset_errors, emergency_recovery, force_stop, clear_queue, restart_scheduler, full_recovery, health_reset, test_recovery'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Failed to perform recovery operation:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to perform recovery operation',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}