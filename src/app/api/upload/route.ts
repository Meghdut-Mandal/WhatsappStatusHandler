import { NextRequest, NextResponse } from 'next/server';
import { StreamingUploader } from '@/lib/uploader';

/**
 * POST /api/upload - Stream file upload with progress tracking
 */
export async function POST(request: NextRequest) {
  try {
    // Get validation options from query params
    const { searchParams } = new URL(request.url);
    const maxSize = searchParams.get('maxSize');
    const allowedTypes = searchParams.get('allowedTypes');

    const validationOptions = {
      ...(maxSize && { maxSize: parseInt(maxSize) }),
      ...(allowedTypes && { allowedMimeTypes: allowedTypes.split(',') }),
    };

    // Use StreamingUploader to process the upload
    const uploads = await StreamingUploader.processUploadFromNextJS(
      request,
      {
        validation: validationOptions,
        onProgress: (progress) => {
          // Progress updates would be handled via WebSocket or SSE in a real implementation
          console.log(`Upload progress: ${progress.originalName} - ${progress.uploaded}/${progress.size} bytes`);
        },
        onComplete: (progress) => {
          console.log(`Upload completed: ${progress.originalName}`);
        },
        onError: (progress) => {
          console.error(`Upload error: ${progress.originalName} - ${progress.error}`);
        },
      }
    );

    // Check if any uploads failed
    const hasErrors = uploads.some(upload => upload.status === 'error');
    const completedUploads = uploads.filter(upload => upload.status === 'completed');

    return NextResponse.json({
      success: !hasErrors || completedUploads.length > 0,
      uploads: uploads.map(upload => ({
        id: upload.id,
        filename: upload.filename,
        originalName: upload.originalName,
        mimetype: upload.mimetype,
        size: upload.size,
        status: upload.status,
        error: upload.error,
        mediaMetaId: upload.mediaMetaId,
        uploadTime: upload.endTime ? upload.endTime - upload.startTime : undefined,
      })),
      summary: {
        total: uploads.length,
        completed: completedUploads.length,
        failed: uploads.filter(upload => upload.status === 'error').length,
        totalSize: completedUploads.reduce((sum, upload) => sum + upload.size, 0),
      },
    });

  } catch (error) {
    console.error('Upload endpoint error:', error);
    return NextResponse.json({
      success: false,
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/upload - Get upload statistics and active uploads
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const active = searchParams.get('active') === 'true';

    if (active) {
      // Return active uploads only
      const activeUploads = StreamingUploader.getAllProgress()
        .filter(upload => upload.status === 'uploading');

      return NextResponse.json({
        success: true,
        activeUploads: activeUploads.map(upload => ({
          id: upload.id,
          filename: upload.originalName,
          mimetype: upload.mimetype,
          progress: upload.size > 0 ? (upload.uploaded / upload.size) * 100 : 0,
          uploaded: upload.uploaded,
          size: upload.size,
          startTime: upload.startTime,
        })),
        count: activeUploads.length,
      });
    }

    // Return general upload statistics
    const allUploads = StreamingUploader.getAllProgress();
    const stats = {
      total: allUploads.length,
      uploading: allUploads.filter(u => u.status === 'uploading').length,
      completed: allUploads.filter(u => u.status === 'completed').length,
      failed: allUploads.filter(u => u.status === 'error').length,
      cancelled: allUploads.filter(u => u.status === 'cancelled').length,
    };

    return NextResponse.json({
      success: true,
      statistics: stats,
      recentUploads: allUploads
        .filter(upload => upload.endTime)
        .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
        .slice(0, 10)
        .map(upload => ({
          id: upload.id,
          filename: upload.originalName,
          mimetype: upload.mimetype,
          size: upload.size,
          status: upload.status,
          uploadTime: upload.endTime ? upload.endTime - upload.startTime : undefined,
        })),
    });

  } catch (error) {
    console.error('Upload statistics error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get upload statistics',
    }, { status: 500 });
  }
}
