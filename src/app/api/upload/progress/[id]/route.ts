import { NextRequest, NextResponse } from 'next/server';
import { StreamingUploader } from '@/lib/uploader';

/**
 * GET /api/upload/progress/[id] - Get upload progress for specific upload
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const { id } = params;

    const progress = StreamingUploader.getProgress(id);
    
    if (!progress) {
      return NextResponse.json({
        success: false,
        error: 'Upload not found',
      }, { status: 404 });
    }

    const progressPercentage = progress.size > 0 ? (progress.uploaded / progress.size) * 100 : 0;
    const elapsedTime = Date.now() - progress.startTime;
    const uploadSpeed = elapsedTime > 0 ? (progress.uploaded / elapsedTime) * 1000 : 0; // bytes per second

    return NextResponse.json({
      success: true,
      progress: {
        id: progress.id,
        filename: progress.originalName,
        mimetype: progress.mimetype,
        size: progress.size,
        uploaded: progress.uploaded,
        percentage: Math.round(progressPercentage * 100) / 100, // Round to 2 decimal places
        status: progress.status,
        error: progress.error,
        startTime: progress.startTime,
        endTime: progress.endTime,
        elapsedTime,
        uploadSpeed: Math.round(uploadSpeed), // bytes per second
        estimatedTimeRemaining: progress.size > progress.uploaded && uploadSpeed > 0 
          ? Math.round((progress.size - progress.uploaded) / uploadSpeed) 
          : null,
        mediaMetaId: progress.mediaMetaId,
      },
    });

  } catch (error) {
    console.error('Progress tracking error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get upload progress',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/upload/progress/[id] - Cancel specific upload
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const { id } = params;

    const cancelled = await StreamingUploader.cancelUpload(id);
    
    if (!cancelled) {
      return NextResponse.json({
        success: false,
        error: 'Upload not found or cannot be cancelled',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Upload cancelled successfully',
      id,
    });

  } catch (error) {
    console.error('Upload cancellation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to cancel upload',
    }, { status: 500 });
  }
}
