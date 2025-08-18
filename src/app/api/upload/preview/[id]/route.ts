import { NextRequest, NextResponse } from 'next/server';
import { MediaMetaService } from '@/lib/db';
import { createReadStream, existsSync } from 'fs';
import { stat } from 'fs/promises';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/upload/preview/[id] - Preview uploaded file (inline display)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'File ID is required'
      }, { status: 400 });
    }

    // Get file metadata from database
    const fileMeta = await MediaMetaService.getById(id);

    if (!fileMeta) {
      return NextResponse.json({
        success: false,
        error: 'File not found'
      }, { status: 404 });
    }

    // Only allow preview for images and videos
    if (!fileMeta.mimetype.startsWith('image/') && !fileMeta.mimetype.startsWith('video/')) {
      return NextResponse.json({
        success: false,
        error: 'Preview not available for this file type'
      }, { status: 400 });
    }

    // Check if file exists on disk
    if (!existsSync(fileMeta.storagePath)) {
      return NextResponse.json({
        success: false,
        error: 'File not found on storage'
      }, { status: 404 });
    }

    // Get file stats
    const fileStats = await stat(fileMeta.storagePath);

    // Check for range request (for video streaming)
    const range = request.headers.get('range');
    
    if (range && fileMeta.mimetype.startsWith('video/')) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileStats.size - 1;
      const chunksize = (end - start) + 1;

      // Create stream with range
      const stream = createReadStream(fileMeta.storagePath, { start, end });
      
      return new NextResponse(stream as unknown as ReadableStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileStats.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': fileMeta.mimetype,
          'Cache-Control': 'public, max-age=86400', // Cache for 1 day
        },
      });
    }

    // Create full file stream
    const stream = createReadStream(fileMeta.storagePath);

    return new NextResponse(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': fileMeta.mimetype,
        'Content-Length': fileStats.size.toString(),
        'Content-Disposition': 'inline', // Display inline for preview
        'Cache-Control': 'public, max-age=86400', // Cache for 1 day
      },
    });

  } catch (error) {
    console.error('Preview file error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to preview file',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
