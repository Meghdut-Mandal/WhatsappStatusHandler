import { NextRequest, NextResponse } from 'next/server';
import { StreamingUploader } from '@/lib/uploader';

/**
 * POST /api/upload/cleanup - Clean temporary files and upload records
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      olderThanHours = 24,
      memoryCleanupMinutes = 30,
      force = false 
    } = body;

    // Clean up memory records of completed uploads
    StreamingUploader.cleanup(memoryCleanupMinutes);

    // Clean up temporary files from disk and database
    const cleanedFiles = await StreamingUploader.cleanupFiles(olderThanHours);

    return NextResponse.json({
      success: true,
      message: 'Cleanup completed successfully',
      cleaned: {
        files: cleanedFiles,
        memoryRecords: 'cleaned',
        olderThanHours,
        memoryCleanupMinutes,
      },
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({
      success: false,
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/upload/cleanup - Get cleanup statistics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const olderThanHours = parseInt(searchParams.get('olderThanHours') || '24');

    // Get temporary files that would be cleaned up
    const { MediaMetaService } = await import('@/lib/db');
    const tempFiles = await MediaMetaService.getTemporaryFiles(olderThanHours);
    
    const totalSize = tempFiles.reduce((sum, file) => sum + file.sizeBytes, 0);
    
    // Get active uploads count
    const activeUploads = StreamingUploader.getAllProgress()
      .filter(upload => upload.status === 'uploading');

    // Get completed uploads in memory
    const completedInMemory = StreamingUploader.getAllProgress()
      .filter(upload => ['completed', 'error', 'cancelled'].includes(upload.status));

    return NextResponse.json({
      success: true,
      cleanup: {
        temporaryFiles: {
          count: tempFiles.length,
          totalSize,
          olderThanHours,
          files: tempFiles.map(file => ({
            id: file.id,
            filename: file.originalName,
            size: file.sizeBytes,
            created: file.tmpCreatedAt,
            mimetype: file.mimetype,
          })),
        },
        memoryRecords: {
          active: activeUploads.length,
          completed: completedInMemory.length,
        },
      },
    });

  } catch (error) {
    console.error('Cleanup statistics error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get cleanup statistics',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/upload/cleanup - Force cleanup of all temporary files
 */
export async function DELETE(request: NextRequest) {
  try {
    // Clean all memory records
    StreamingUploader.cleanup(0); // Clean everything

    // Clean all temporary files
    const cleanedFiles = await StreamingUploader.cleanupFiles(0); // Clean everything

    return NextResponse.json({
      success: true,
      message: 'Force cleanup completed',
      cleaned: {
        files: cleanedFiles,
        memoryRecords: 'all cleared',
      },
    });

  } catch (error) {
    console.error('Force cleanup error:', error);
    return NextResponse.json({
      success: false,
      error: 'Force cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
