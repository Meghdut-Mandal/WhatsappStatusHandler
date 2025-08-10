import { NextRequest, NextResponse } from 'next/server';
import { AdvancedUploader } from '@/lib/uploader/AdvancedUploader';

/**
 * POST /api/upload/resume - Resume paused upload
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uploadId } = body;

    if (!uploadId) {
      return NextResponse.json({
        success: false,
        error: 'uploadId is required',
      }, { status: 400 });
    }

    const uploader = AdvancedUploader.getInstance();
    const resumed = uploader.resumeUpload(uploadId);

    if (resumed) {
      return NextResponse.json({
        success: true,
        message: 'Upload resumed successfully',
        uploadId,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Upload not found or cannot be resumed',
        uploadId,
      }, { status: 404 });
    }

  } catch (error) {
    console.error('Resume upload error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to resume upload',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/upload/resume - Get resumable uploads
 */
export async function GET(request: NextRequest) {
  try {
    const uploader = AdvancedUploader.getInstance();
    // In a real implementation, you'd get resumable uploads from storage
    // For now, return empty array as we don't have resume data stored
    
    return NextResponse.json({
      success: true,
      resumableUploads: [],
      message: 'No resumable uploads found',
    });

  } catch (error) {
    console.error('Get resumable uploads error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get resumable uploads',
    }, { status: 500 });
  }
}
