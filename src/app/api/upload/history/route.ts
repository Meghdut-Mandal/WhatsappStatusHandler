import { NextRequest, NextResponse } from 'next/server';
import { MediaMetaService } from '@/lib/db';

/**
 * GET /api/upload/history - Get uploaded media history
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';
    const mimeType = searchParams.get('mimeType') || '';
    const sortBy = searchParams.get('sortBy') || 'tmpCreatedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Build filter conditions
    const filters: Record<string, unknown> = {};
    
    if (search) {
      filters.OR = [
        { originalName: { contains: search, mode: 'insensitive' } },
        { filename: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (mimeType) {
      if (mimeType === 'image') {
        filters.mimetype = { startsWith: 'image/' };
      } else if (mimeType === 'video') {
        filters.mimetype = { startsWith: 'video/' };
      } else if (mimeType === 'audio') {
        filters.mimetype = { startsWith: 'audio/' };
      } else if (mimeType === 'document') {
        filters.OR = [
          { mimetype: { startsWith: 'application/' } },
          { mimetype: { startsWith: 'text/' } }
        ];
      } else {
        filters.mimetype = mimeType;
      }
    }

    // Get total count
    const totalCount = await MediaMetaService.count(filters);

    // Get media files
    const mediaFiles = await MediaMetaService.findMany({
      where: filters,
      orderBy: { [sortBy]: sortOrder },
      skip: offset,
      take: limit,
    });

    // Format response
    const formattedFiles = mediaFiles.map(file => ({
      id: file.id,
      filename: file.filename,
      originalName: file.originalName,
      mimetype: file.mimetype,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      createdAt: file.tmpCreatedAt,
      duration: file.duration,
      width: file.width,
      height: file.height,
      isTemporary: file.isTemporary,
      // Generate preview URL for media files
      previewUrl: file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')
        ? `/api/upload/preview/${file.id}`
        : null,
      // Generate download URL
      downloadUrl: `/api/upload/download/${file.id}`,
    }));

    return NextResponse.json({
      success: true,
      files: formattedFiles,
      pagination: {
        total: totalCount,
        returned: formattedFiles.length,
        offset,
        limit,
        hasMore: offset + limit < totalCount,
      },
      filters: {
        search,
        mimeType,
        sortBy,
        sortOrder,
      },
    });

  } catch (error) {
    console.error('Get upload history error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get upload history',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/upload/history - Clear upload history
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileIds = searchParams.get('fileIds')?.split(',') || [];
    const clearAll = searchParams.get('clearAll') === 'true';

    if (clearAll) {
      // Clear all temporary files
      const deletedCount = await MediaMetaService.deleteMany({
        where: { isTemporary: true }
      });
      
      return NextResponse.json({
        success: true,
        message: `Cleared ${deletedCount} files from upload history`,
        deletedCount,
      });
    } else if (fileIds.length > 0) {
      // Delete specific files
      const deletedCount = await MediaMetaService.deleteMany({
        where: { id: { in: fileIds } }
      });
      
      return NextResponse.json({
        success: true,
        message: `Deleted ${deletedCount} files from upload history`,
        deletedCount,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'No files specified for deletion',
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Clear upload history error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to clear upload history',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
