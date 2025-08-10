import { NextRequest, NextResponse } from 'next/server';
import { AdvancedUploader } from '@/lib/uploader/AdvancedUploader';
import { FileProcessor } from '@/lib/uploader/FileProcessor';

/**
 * GET /api/upload/analytics - Get comprehensive upload analytics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '24h'; // 1h, 24h, 7d, 30d
    const detailed = searchParams.get('detailed') === 'true';

    const uploader = AdvancedUploader.getInstance();
    const processor = FileProcessor.getInstance();
    
    const analytics = uploader.getAnalytics();
    const queueStatus = uploader.getQueueStatus();
    const processingStatus = processor.getQueueStatus();

    let response: any = {
      success: true,
      period,
      timestamp: new Date().toISOString(),
      upload: {
        totalUploads: analytics.totalUploads,
        totalBytes: analytics.totalBytes,
        totalBytesFormatted: formatBytes(analytics.totalBytes),
        averageSpeed: analytics.averageSpeed,
        averageSpeedFormatted: `${formatBytes(analytics.averageSpeed)}/s`,
        successRate: analytics.successRate,
        activeUploads: analytics.activeUploads,
        queueLength: analytics.queueLength,
        bandwidthUsage: analytics.bandwidthUsage,
        bandwidthUsageFormatted: `${formatBytes(analytics.bandwidthUsage)}/s`,
      },
      queue: {
        total: queueStatus.total,
        active: queueStatus.active,
        queued: queueStatus.queued,
      },
      processing: {
        activeBatches: processingStatus.totalActive,
        queuedBatches: processingStatus.totalQueued,
      },
      system: {
        memoryUsage: analytics.memoryUsage,
        memoryUsageFormatted: formatBytes(analytics.memoryUsage),
        memoryUsagePercent: (analytics.memoryUsage / (1024 * 1024 * 1024)) * 100, // Rough percentage
      },
    };

    if (detailed) {
      // Add detailed analytics
      response.detailed = {
        uploadTrends: await getUploadTrends(period),
        fileTypeBreakdown: await getFileTypeBreakdown(period),
        performanceMetrics: await getPerformanceMetrics(period),
        errorAnalysis: await getErrorAnalysis(period),
      };
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get upload analytics',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * Helper functions for detailed analytics
 */
async function getUploadTrends(period: string) {
  // In a real implementation, this would query historical data from database
  return {
    hourlyUploads: [],
    peakHours: [],
    averageFileSize: 0,
    trendsMessage: `Upload trends for ${period} would be calculated from historical data`,
  };
}

async function getFileTypeBreakdown(period: string) {
  // In a real implementation, this would analyze file types from database
  return {
    images: { count: 0, totalSize: 0, percentage: 0 },
    videos: { count: 0, totalSize: 0, percentage: 0 },
    audio: { count: 0, totalSize: 0, percentage: 0 },
    documents: { count: 0, totalSize: 0, percentage: 0 },
    message: `File type breakdown for ${period} would be calculated from historical data`,
  };
}

async function getPerformanceMetrics(period: string) {
  return {
    averageUploadTime: 0,
    fastestUpload: 0,
    slowestUpload: 0,
    compressionEfficiency: 0,
    retryRate: 0,
    message: `Performance metrics for ${period} would be calculated from historical data`,
  };
}

async function getErrorAnalysis(period: string) {
  return {
    totalErrors: 0,
    errorTypes: {},
    mostCommonErrors: [],
    errorRate: 0,
    message: `Error analysis for ${period} would be calculated from historical data`,
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
