import { NextRequest, NextResponse } from 'next/server';
import { AdvancedUploader } from '@/lib/uploader/AdvancedUploader';

/**
 * POST /api/upload/queue - Add files to upload queue
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files, priority = 5, options } = body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Files array is required',
      }, { status: 400 });
    }

    const uploader = AdvancedUploader.getInstance();
    const uploadIds: string[] = [];

    for (const fileInfo of files) {
      const { name, size, type } = fileInfo;
      
      // Validate file info
      if (!name || !size || !type) {
        continue;
      }

      // Create file-like object for queue processing
      const file = {
        name,
        size,
        type,
        stream: null, // Would be set when actual upload starts
      };

      const uploadId = await uploader.addToQueue(file, priority, options);
      uploadIds.push(uploadId);
    }

    return NextResponse.json({
      success: true,
      message: `${uploadIds.length} files added to upload queue`,
      uploadIds,
      queueStatus: uploader.getQueueStatus(),
    });

  } catch (error) {
    console.error('Queue upload error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to add files to queue',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/upload/queue - Get upload queue status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const detailed = searchParams.get('detailed') === 'true';

    const uploader = AdvancedUploader.getInstance();
    const queueStatus = uploader.getQueueStatus();
    const analytics = uploader.getAnalytics();

    let response: any = {
      success: true,
      queue: queueStatus,
      analytics,
    };

    if (detailed) {
      // Add more detailed information if requested
      response.details = {
        memoryUsage: analytics.memoryUsage,
        bandwidthUsage: analytics.bandwidthUsage,
        averageSpeed: analytics.averageSpeed,
      };
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Queue status error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get queue status',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/upload/queue - Clear upload queue or cancel specific uploads
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uploadId = searchParams.get('uploadId');
    const clearAll = searchParams.get('clearAll') === 'true';

    const uploader = AdvancedUploader.getInstance();

    if (uploadId) {
      // Cancel specific upload
      const cancelled = uploader.pauseUpload(uploadId);
      return NextResponse.json({
        success: cancelled,
        message: cancelled ? 'Upload cancelled' : 'Upload not found or already completed',
      });
    }

    if (clearAll) {
      // Clear completed uploads from memory
      uploader.clearCompleted();
      return NextResponse.json({
        success: true,
        message: 'Completed uploads cleared from memory',
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Either uploadId or clearAll parameter is required',
    }, { status: 400 });

  } catch (error) {
    console.error('Queue cleanup error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process queue operation',
    }, { status: 500 });
  }
}
