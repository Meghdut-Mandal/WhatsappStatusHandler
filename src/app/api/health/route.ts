/**
 * System Health Check API
 * Week 4 - Developer A Implementation
 */

import { NextRequest, NextResponse } from 'next/server';
import { systemMonitor } from '@/lib/monitoring/SystemMonitor';
import { errorHandler, ErrorCategory, ErrorSeverity } from '@/lib/errors/ErrorHandler';

/**
 * GET /api/health - Get system health status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const detailed = searchParams.get('detailed') === 'true';
    const component = searchParams.get('component');

    if (component) {
      // Get health for specific component
      const healthCheck = systemMonitor.getHealthCheck(component);
      
      if (!healthCheck) {
        return NextResponse.json({
          success: false,
          error: 'Component not found',
          availableComponents: ['database', 'whatsapp', 'filesystem', 'memory', 'disk_space']
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        component,
        health: healthCheck
      });
    }

    // Get overall system health
    const systemHealth = systemMonitor.getSystemHealth();
    const currentMetrics = systemMonitor.getCurrentMetrics();
    const alerts = systemMonitor.getAlerts();

    interface HealthResponse {
      success: boolean;
      timestamp: string;
      status: string;
      summary: {
        overall: string;
        activeAlerts: number;
        healthChecks: number;
        uptime: number;
      };
      details?: {
        healthChecks: Array<Record<string, unknown>>;
        metrics: Record<string, unknown>;
        alerts: Array<Record<string, unknown>>;
        system: {
          nodeVersion: string;
          platform: string;
          arch: string;
          pid: number;
          memory: NodeJS.MemoryUsage;
          uptime: number;
        };
      };
    }

    const response: HealthResponse = {
      success: true,
      timestamp: new Date().toISOString(),
      status: systemHealth.overall,
      summary: {
        overall: systemHealth.overall,
        activeAlerts: alerts.length,
        healthChecks: systemHealth.checks.length,
        uptime: process.uptime()
      }
    };

    if (detailed) {
      response.details = {
        healthChecks: systemHealth.checks,
        metrics: currentMetrics,
        alerts: alerts.slice(0, 10), // Last 10 alerts
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid,
          memory: process.memoryUsage(),
          uptime: process.uptime()
        }
      };
    }

    // Set appropriate HTTP status based on health
    let statusCode = 200;
    if (systemHealth.overall === 'warning') {
      statusCode = 200; // Still OK, but with warnings
    } else if (systemHealth.overall === 'critical') {
      statusCode = 503; // Service unavailable
    }

    return NextResponse.json(response, { status: statusCode });

  } catch (error) {
    const appError = errorHandler.handleError(error, {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.HIGH,
      context: { component: 'HealthAPI', action: 'get_health' }
    });

    return NextResponse.json({
      success: false,
      error: 'Health check failed',
      details: appError.userMessage,
      errorId: appError.id
    }, { status: 500 });
  }
}

/**
 * POST /api/health/check - Trigger manual health check
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const component = body.component;

    if (component) {
      // Run specific health check
      await systemMonitor['runHealthChecks'](); // Access private method for manual trigger
      const healthCheck = systemMonitor.getHealthCheck(component);
      
      return NextResponse.json({
        success: true,
        message: `Health check completed for ${component}`,
        result: healthCheck
      });
    }

    // Run all health checks
    await systemMonitor['runHealthChecks']();
    const systemHealth = systemMonitor.getSystemHealth();

    return NextResponse.json({
      success: true,
      message: 'All health checks completed',
      timestamp: new Date().toISOString(),
      results: systemHealth
    });

  } catch (error) {
    const appError = errorHandler.handleError(error, {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.MEDIUM,
      context: { component: 'HealthAPI', action: 'manual_check' }
    });

    return NextResponse.json({
      success: false,
      error: 'Manual health check failed',
      details: appError.userMessage,
      errorId: appError.id
    }, { status: 500 });
  }
}
