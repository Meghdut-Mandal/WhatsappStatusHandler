/**
 * System Metrics API
 * Week 4 - Developer A Implementation
 */

import { NextRequest, NextResponse } from 'next/server';
import { systemMonitor } from '@/lib/monitoring/SystemMonitor';
import { errorHandler, ErrorCategory, ErrorSeverity } from '@/lib/errors/ErrorHandler';

/**
 * GET /api/metrics - Get system metrics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('range') || 'current'; // current, hour, day, week
    const format = searchParams.get('format') || 'json'; // json, prometheus

    let metrics;
    
    switch (timeRange) {
      case 'current':
        metrics = systemMonitor.getCurrentMetrics();
        break;
      case 'hour':
        metrics = systemMonitor.getMetricsHistory(120); // Last 2 hours at 30s intervals
        break;
      case 'day':
        metrics = systemMonitor.getMetricsHistory(288); // Last day at 5min intervals
        break;
      case 'week':
        metrics = systemMonitor.getMetricsHistory(672); // Last week at 15min intervals
        break;
      default:
        metrics = systemMonitor.getCurrentMetrics();
    }

    if (!metrics) {
      return NextResponse.json({
        success: false,
        error: 'No metrics available',
        message: 'System monitoring may not be started'
      }, { status: 404 });
    }

    if (format === 'prometheus') {
      // Convert to Prometheus format
      const prometheusMetrics = convertToPrometheusFormat(
        Array.isArray(metrics) ? metrics : [metrics]
      );
      
      return new NextResponse(prometheusMetrics, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8'
        }
      });
    }

    // JSON format
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      timeRange,
      metrics: Array.isArray(metrics) ? metrics : [metrics],
      summary: Array.isArray(metrics) ? generateSummary(metrics) : undefined
    };

    return NextResponse.json(response);

  } catch (error) {
    const appError = errorHandler.handleError(error, {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.MEDIUM,
      context: { component: 'MetricsAPI', action: 'get_metrics' }
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve metrics',
      details: appError.userMessage,
      errorId: appError.id
    }, { status: 500 });
  }
}

/**
 * POST /api/metrics/alerts - Get and manage alerts
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action; // 'list', 'resolve', 'clear'

    switch (action) {
      case 'list':
        const includeResolved = body.includeResolved || false;
        const alerts = systemMonitor.getAlerts(includeResolved);
        
        return NextResponse.json({
          success: true,
          alerts,
          total: alerts.length,
          active: alerts.filter(a => !a.resolved).length
        });

      case 'resolve':
        const alertId = body.alertId;
        if (!alertId) {
          return NextResponse.json({
            success: false,
            error: 'Alert ID is required'
          }, { status: 400 });
        }

        const resolved = systemMonitor.resolveAlert(alertId);
        return NextResponse.json({
          success: resolved,
          message: resolved ? 'Alert resolved' : 'Alert not found'
        });

      case 'clear':
        systemMonitor.clearResolvedAlerts();
        return NextResponse.json({
          success: true,
          message: 'Resolved alerts cleared'
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action',
          validActions: ['list', 'resolve', 'clear']
        }, { status: 400 });
    }

  } catch (error) {
    const appError = errorHandler.handleError(error, {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.MEDIUM,
      context: { component: 'MetricsAPI', action: 'manage_alerts' }
    });

    return NextResponse.json({
      success: false,
      error: 'Alert management failed',
      details: appError.userMessage,
      errorId: appError.id
    }, { status: 500 });
  }
}

/**
 * Helper functions
 */
interface MetricData {
  timestamp: string;
  memory: { used: number; free: number; total: number; percentage: number };
  cpu: { usage: number; loadAverage: number[] };
  disk: { used: number; free: number; total: number; percentage: number };
  connections: { whatsapp: boolean; database: boolean };
  performance: { responseTime: number; throughput: number; errorRate: number };
  uptime: number;
}

function convertToPrometheusFormat(metrics: MetricData[]): string {
  if (metrics.length === 0) return '';

  const latest = metrics[metrics.length - 1];
  const lines: string[] = [];

  // Memory metrics
  lines.push('# HELP memory_usage_bytes Memory usage in bytes');
  lines.push('# TYPE memory_usage_bytes gauge');
  lines.push(`memory_usage_bytes{type="used"} ${latest.memory.used}`);
  lines.push(`memory_usage_bytes{type="free"} ${latest.memory.free}`);
  lines.push(`memory_usage_bytes{type="total"} ${latest.memory.total}`);

  lines.push('# HELP memory_usage_percentage Memory usage percentage');
  lines.push('# TYPE memory_usage_percentage gauge');
  lines.push(`memory_usage_percentage ${latest.memory.percentage}`);

  // CPU metrics
  lines.push('# HELP cpu_usage_percentage CPU usage percentage');
  lines.push('# TYPE cpu_usage_percentage gauge');
  lines.push(`cpu_usage_percentage ${latest.cpu.usage}`);

  lines.push('# HELP cpu_load_average CPU load average');
  lines.push('# TYPE cpu_load_average gauge');
  latest.cpu.loadAverage.forEach((load: number, index: number) => {
    lines.push(`cpu_load_average{period="${[1, 5, 15][index]}min"} ${load}`);
  });

  // Disk metrics
  lines.push('# HELP disk_usage_bytes Disk usage in bytes');
  lines.push('# TYPE disk_usage_bytes gauge');
  lines.push(`disk_usage_bytes{type="used"} ${latest.disk.used}`);
  lines.push(`disk_usage_bytes{type="free"} ${latest.disk.free}`);
  lines.push(`disk_usage_bytes{type="total"} ${latest.disk.total}`);

  lines.push('# HELP disk_usage_percentage Disk usage percentage');
  lines.push('# TYPE disk_usage_percentage gauge');
  lines.push(`disk_usage_percentage ${latest.disk.percentage}`);

  // Connection status
  lines.push('# HELP connection_status Connection status (1=connected, 0=disconnected)');
  lines.push('# TYPE connection_status gauge');
  lines.push(`connection_status{service="whatsapp"} ${latest.connections.whatsapp ? 1 : 0}`);
  lines.push(`connection_status{service="database"} ${latest.connections.database ? 1 : 0}`);

  // Performance metrics
  lines.push('# HELP response_time_ms Response time in milliseconds');
  lines.push('# TYPE response_time_ms gauge');
  lines.push(`response_time_ms ${latest.performance.responseTime}`);

  lines.push('# HELP throughput_requests_per_second Throughput in requests per second');
  lines.push('# TYPE throughput_requests_per_second gauge');
  lines.push(`throughput_requests_per_second ${latest.performance.throughput}`);

  lines.push('# HELP error_rate_percentage Error rate percentage');
  lines.push('# TYPE error_rate_percentage gauge');
  lines.push(`error_rate_percentage ${latest.performance.errorRate}`);

  // System uptime
  lines.push('# HELP system_uptime_seconds System uptime in seconds');
  lines.push('# TYPE system_uptime_seconds counter');
  lines.push(`system_uptime_seconds ${latest.uptime}`);

  return lines.join('\n') + '\n';
}

function generateSummary(metrics: MetricData[]) {
  if (metrics.length === 0) return null;

  const latest = metrics[metrics.length - 1];
  const oldest = metrics[0];
  
  // Calculate averages over the time period
  const avgMemory = metrics.reduce((sum, m) => sum + m.memory.percentage, 0) / metrics.length;
  const avgCpu = metrics.reduce((sum, m) => sum + m.cpu.usage, 0) / metrics.length;
  const avgDisk = metrics.reduce((sum, m) => sum + m.disk.percentage, 0) / metrics.length;
  const avgResponseTime = metrics.reduce((sum, m) => sum + m.performance.responseTime, 0) / metrics.length;

  // Find peaks
  const peakMemory = Math.max(...metrics.map(m => m.memory.percentage));
  const peakCpu = Math.max(...metrics.map(m => m.cpu.usage));
  const peakResponseTime = Math.max(...metrics.map(m => m.performance.responseTime));

  return {
    timeSpan: {
      start: oldest.timestamp,
      end: latest.timestamp,
      duration: new Date(latest.timestamp).getTime() - new Date(oldest.timestamp).getTime()
    },
    averages: {
      memory: Math.round(avgMemory * 100) / 100,
      cpu: Math.round(avgCpu * 100) / 100,
      disk: Math.round(avgDisk * 100) / 100,
      responseTime: Math.round(avgResponseTime)
    },
    peaks: {
      memory: Math.round(peakMemory * 100) / 100,
      cpu: Math.round(peakCpu * 100) / 100,
      responseTime: Math.round(peakResponseTime)
    },
    current: {
      memory: latest.memory.percentage,
      cpu: latest.cpu.usage,
      disk: latest.disk.percentage,
      connections: latest.connections,
      uptime: latest.uptime
    }
  };
}
