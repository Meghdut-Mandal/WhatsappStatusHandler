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
 * GET /api/sync/alerts - Get sync alerts and monitoring data
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeAcknowledged = searchParams.get('include_acknowledged') === 'true';
    const alertType = searchParams.get('type');
    const severity = searchParams.get('severity');

    const manager = getBaileysManager();
    const connectionStatus = manager.getConnectionStatus();

    if (connectionStatus.status !== 'connected') {
      return NextResponse.json({
        success: true,
        data: {
          connected: false,
          alerts: [],
          metrics: null,
          message: 'WhatsApp not connected'
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

    // Get alerts
    let alerts = contactManager.getSyncAlerts(includeAcknowledged);

    // Apply filters
    if (alertType) {
      alerts = alerts.filter(alert => alert.type === alertType);
    }

    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }

    // Get monitoring metrics
    const metrics = contactManager.getMonitoringMetrics();

    return NextResponse.json({
      success: true,
      data: {
        connected: true,
        alerts: alerts.map(alert => ({
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          timestamp: alert.timestamp,
          acknowledged: alert.acknowledged,
          details: alert.details
        })),
        metrics: {
          uptime: metrics.uptime,
          totalSyncs: metrics.totalSyncs,
          successfulSyncs: metrics.successfulSyncs,
          failedSyncs: metrics.failedSyncs,
          currentErrorRate: metrics.currentErrorRate,
          systemHealth: metrics.systemHealth,
          lastSyncAt: metrics.lastSyncAt,
          activeAlertsCount: metrics.activeAlerts.length
        },
        summary: {
          totalAlerts: alerts.length,
          unacknowledgedAlerts: alerts.filter(a => !a.acknowledged).length,
          criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
          highAlerts: alerts.filter(a => a.severity === 'high').length
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Failed to get sync alerts:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get sync alerts',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * POST /api/sync/alerts - Manage sync alerts
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, alertId, alertIds, config } = body;

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
      case 'acknowledge':
        if (!alertId) {
          return NextResponse.json({
            success: false,
            error: 'Alert ID required for acknowledge action'
          }, { status: 400 });
        }

        const acknowledged = contactManager.acknowledgeSyncAlert(alertId);
        if (!acknowledged) {
          return NextResponse.json({
            success: false,
            error: 'Alert not found or already acknowledged'
          }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          message: 'Alert acknowledged successfully',
          alertId,
          timestamp: new Date().toISOString()
        });

      case 'acknowledge_multiple':
        if (!alertIds || !Array.isArray(alertIds)) {
          return NextResponse.json({
            success: false,
            error: 'Alert IDs array required for acknowledge_multiple action'
          }, { status: 400 });
        }

        const results = alertIds.map(id => ({
          alertId: id,
          acknowledged: contactManager.acknowledgeSyncAlert(id)
        }));

        const successCount = results.filter(r => r.acknowledged).length;

        return NextResponse.json({
          success: true,
          message: `${successCount}/${alertIds.length} alerts acknowledged`,
          results,
          timestamp: new Date().toISOString()
        });

      case 'acknowledge_all':
        const syncMonitor = contactManager.getSyncMonitor();
        const allAlerts = syncMonitor.getAlerts(false); // Get unacknowledged alerts
        let acknowledgedCount = 0;

        for (const alert of allAlerts) {
          if (syncMonitor.acknowledgeAlert(alert.id)) {
            acknowledgedCount++;
          }
        }

        return NextResponse.json({
          success: true,
          message: `${acknowledgedCount} alerts acknowledged`,
          acknowledgedCount,
          timestamp: new Date().toISOString()
        });

      case 'clear_old':
        const { maxAge = 24 * 60 * 60 * 1000 } = body; // Default 24 hours
        const monitor = contactManager.getSyncMonitor();
        const clearedCount = monitor.clearOldAlerts(maxAge);

        return NextResponse.json({
          success: true,
          message: `${clearedCount} old alerts cleared`,
          clearedCount,
          maxAge,
          timestamp: new Date().toISOString()
        });

      case 'update_config':
        if (!config || typeof config !== 'object') {
          return NextResponse.json({
            success: false,
            error: 'Config object required for update_config action'
          }, { status: 400 });
        }

        contactManager.updateMonitoringConfig(config);

        return NextResponse.json({
          success: true,
          message: 'Monitoring configuration updated',
          config,
          timestamp: new Date().toISOString()
        });

      case 'export_data':
        const monitorInstance = contactManager.getSyncMonitor();
        const exportData = monitorInstance.exportData();

        return NextResponse.json({
          success: true,
          message: 'Monitoring data exported',
          data: exportData,
          timestamp: new Date().toISOString()
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Supported actions: acknowledge, acknowledge_multiple, acknowledge_all, clear_old, update_config, export_data'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Failed to process alert action:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process alert action',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * DELETE /api/sync/alerts - Clear all alerts or specific alert
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const alertId = searchParams.get('id');

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

    const syncMonitor = contactManager.getSyncMonitor();

    if (alertId) {
      // Delete specific alert
      const alert = syncMonitor.getAlert(alertId);
      if (!alert) {
        return NextResponse.json({
          success: false,
          error: 'Alert not found'
        }, { status: 404 });
      }

      // Mark as acknowledged (soft delete)
      const acknowledged = syncMonitor.acknowledgeAlert(alertId);

      return NextResponse.json({
        success: true,
        message: 'Alert deleted successfully',
        alertId,
        acknowledged,
        timestamp: new Date().toISOString()
      });
    } else {
      // Clear all old alerts (older than 1 hour)
      const clearedCount = syncMonitor.clearOldAlerts(60 * 60 * 1000);

      return NextResponse.json({
        success: true,
        message: `${clearedCount} alerts cleared`,
        clearedCount,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Failed to delete alerts:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete alerts',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}