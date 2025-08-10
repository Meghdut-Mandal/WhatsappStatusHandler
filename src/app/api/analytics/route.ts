import { NextRequest, NextResponse } from 'next/server';
import { SendHistoryService } from '@/lib/db';

/**
 * GET /api/analytics - Get analytics data
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '7d';

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    
    switch (range) {
      case '1d':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default: // 7d
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
    }

    // Get send history data
    const sendHistory = await SendHistoryService.findMany({
      where: {
        createdAt: {
          gte: startDate
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate overview statistics
    const totalMessages = sendHistory.length;
    const successfulMessages = sendHistory.filter(h => h.status === 'completed').length;
    const failedMessages = sendHistory.filter(h => h.status === 'failed').length;
    const pendingMessages = sendHistory.filter(h => h.status === 'pending').length;
    const successRate = totalMessages > 0 ? (successfulMessages / totalMessages) * 100 : 0;

    // Calculate message stats by type and target
    const messagesByType = sendHistory.reduce((acc, msg) => {
      acc[msg.targetType] = (acc[msg.targetType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const messagesByTarget = {
      status: sendHistory.filter(h => h.targetType === 'status').length,
      contact: sendHistory.filter(h => h.targetType === 'contact').length,
      group: sendHistory.filter(h => h.targetType === 'group').length
    };

    // Generate time series data
    const days = range === '1d' ? 24 : range === '30d' ? 30 : range === '90d' ? 90 : 7;
    const timeUnit = range === '1d' ? 'hour' : 'day';
    const timeSeriesData = generateTimeSeriesData(sendHistory, days, timeUnit);

    // Mock additional data (would come from actual database/metrics in production)
    const analyticsData = {
      overview: {
        totalMessages,
        totalUploads: Math.floor(totalMessages * 0.8), // Estimate
        totalSize: Math.floor(Math.random() * 5 * 1024 * 1024 * 1024), // Mock size
        activeUsers: Math.floor(Math.random() * 50) + 10,
        successRate,
        avgResponseTime: Math.floor(Math.random() * 2000) + 500
      },
      messageStats: {
        sent: successfulMessages,
        failed: failedMessages,
        scheduled: pendingMessages,
        byType: messagesByType,
        byTarget: messagesByTarget
      },
      uploadStats: {
        total: Math.floor(totalMessages * 0.8),
        byType: {
          image: Math.floor(totalMessages * 0.5),
          video: Math.floor(totalMessages * 0.2),
          document: Math.floor(totalMessages * 0.1)
        },
        bySize: {
          '<1MB': Math.floor(totalMessages * 0.4),
          '1-10MB': Math.floor(totalMessages * 0.3),
          '>10MB': Math.floor(totalMessages * 0.1)
        },
        avgSize: Math.floor(Math.random() * 10 * 1024 * 1024) // Random avg size
      },
      performanceStats: {
        avgUploadTime: Math.floor(Math.random() * 5000) + 1000,
        avgProcessingTime: Math.floor(Math.random() * 2000) + 500,
        errorRate: failedMessages > 0 ? (failedMessages / totalMessages) * 100 : 0,
        throughput: Math.floor(Math.random() * 100) + 20
      },
      timeSeriesData,
      recentActivity: sendHistory.slice(0, 10).map(msg => ({
        id: msg.id,
        type: msg.status === 'completed' ? 'message' : msg.status === 'failed' ? 'error' : 'system',
        description: `Message ${msg.status} to ${msg.targetType}: ${msg.targetIdentifier}`,
        timestamp: msg.createdAt,
        status: msg.status === 'completed' ? 'success' : msg.status === 'failed' ? 'error' : 'warning'
      }))
    };

    return NextResponse.json(analyticsData);

  } catch (error) {
    console.error('Failed to get analytics data:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get analytics data'
    }, { status: 500 });
  }
}

function generateTimeSeriesData(sendHistory: any[], days: number, timeUnit: 'hour' | 'day') {
  const now = new Date();
  const timeSeriesMessages = [];
  const timeSeriesUploads = [];
  const timeSeriesErrors = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    if (timeUnit === 'hour') {
      date.setHours(date.getHours() - i, 0, 0, 0);
    } else {
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
    }

    const nextDate = new Date(date);
    if (timeUnit === 'hour') {
      nextDate.setHours(nextDate.getHours() + 1);
    } else {
      nextDate.setDate(nextDate.getDate() + 1);
    }

    const messagesInPeriod = sendHistory.filter(msg => {
      const msgDate = new Date(msg.createdAt);
      return msgDate >= date && msgDate < nextDate;
    });

    const errorCount = messagesInPeriod.filter(msg => msg.status === 'failed').length;

    timeSeriesMessages.push({
      date: date.toISOString(),
      count: messagesInPeriod.length
    });

    timeSeriesUploads.push({
      date: date.toISOString(),
      count: Math.floor(messagesInPeriod.length * 0.8),
      size: Math.floor(Math.random() * 100 * 1024 * 1024) // Mock size
    });

    timeSeriesErrors.push({
      date: date.toISOString(),
      count: errorCount
    });
  }

  return {
    messages: timeSeriesMessages,
    uploads: timeSeriesUploads,
    errors: timeSeriesErrors
  };
}
