import { NextRequest, NextResponse } from 'next/server';
import { FileProcessor, BatchProcessingOptions } from '@/lib/uploader/FileProcessor';

/**
 * POST /api/upload/batch - Process batch of files
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      batchId,
      files,
      processingOptions = {},
      sequenceOrder,
      scheduleTime,
      intervalBetween = 1000
    } = body;

    // Validate required fields
    if (!batchId || !files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'batchId and files array are required',
      }, { status: 400 });
    }

    const processor = FileProcessor.getInstance();
    
    const batchOptions: BatchProcessingOptions = {
      batchId,
      files,
      processingOptions,
      sequenceOrder,
      intervalBetween,
      ...(scheduleTime && { scheduleTime: new Date(scheduleTime) })
    };

    if (scheduleTime) {
      // Schedule batch processing
      const scheduledId = await processor.scheduleBatch(batchOptions);
      
      return NextResponse.json({
        success: true,
        message: 'Batch scheduled for processing',
        batchId: scheduledId,
        scheduledTime: scheduleTime,
        filesCount: files.length,
      });
    } else {
      // Process batch immediately
      const result = await processor.processBatch(batchOptions);
      
      return NextResponse.json({
        success: true,
        message: 'Batch processing completed',
        result: {
          batchId: result.batchId,
          totalFiles: result.totalFiles,
          processedFiles: result.processedFiles.length,
          failedFiles: result.failedFiles.length,
          processingTime: result.totalProcessingTime,
          compressionRatio: result.averageCompressionRatio,
          sizeBefore: result.totalSizeBefore,
          sizeAfter: result.totalSizeAfter,
          processedFileIds: result.processedFiles.map(f => f.originalId),
          failures: result.failedFiles,
        },
      });
    }

  } catch (error) {
    console.error('Batch processing error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process batch',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/upload/batch - Get batch processing status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    const processor = FileProcessor.getInstance();
    const queueStatus = processor.getQueueStatus();

    if (batchId) {
      // Check if specific batch is being processed
      const isActive = queueStatus.active.includes(batchId);
      const isQueued = queueStatus.queued.includes(batchId);
      
      return NextResponse.json({
        success: true,
        batchId,
        status: isActive ? 'processing' : isQueued ? 'queued' : 'not_found',
        isActive,
        isQueued,
      });
    }

    // Return overall batch processing status
    return NextResponse.json({
      success: true,
      queueStatus,
      summary: {
        activeBatches: queueStatus.totalActive,
        queuedBatches: queueStatus.totalQueued,
        totalBatches: queueStatus.totalActive + queueStatus.totalQueued,
      },
    });

  } catch (error) {
    console.error('Batch status error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get batch status',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/upload/batch - Cancel batch processing
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return NextResponse.json({
        success: false,
        error: 'batchId parameter is required',
      }, { status: 400 });
    }

    const processor = FileProcessor.getInstance();
    const cancelled = processor.cancelBatch(batchId);

    return NextResponse.json({
      success: cancelled,
      message: cancelled ? 'Batch processing cancelled' : 'Batch not found or already completed',
      batchId,
    });

  } catch (error) {
    console.error('Batch cancellation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to cancel batch',
    }, { status: 500 });
  }
}
