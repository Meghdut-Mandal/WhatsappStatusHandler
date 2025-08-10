import { NextRequest, NextResponse } from 'next/server';
import { getSecureFileHandler } from '@/lib/security/SecureFileHandler';
import { getSecurityMonitor } from '@/lib/security/SecurityMonitor';

interface RouteParams {
  params: {
    fileId: string;
  };
}

/**
 * GET /api/upload/secure/[fileId] - Download secure file
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { fileId } = params;
    const { searchParams } = new URL(request.url);
    const password = searchParams.get('password');

    if (!fileId) {
      return NextResponse.json({
        success: false,
        error: 'File ID is required'
      }, { status: 400 });
    }

    const secureFileHandler = getSecureFileHandler();
    const { buffer, metadata } = await secureFileHandler.retrieveFile(fileId, password || undefined);

    // Log access
    const securityMonitor = getSecurityMonitor();
    await securityMonitor.logSecurityEvent({
      type: 'file_access',
      severity: 'low',
      source: 'SecureDownloadAPI',
      description: `Secure file accessed: ${metadata.originalName}`,
      metadata: {
        fileId: metadata.id,
        fileName: metadata.originalName,
        accessCount: metadata.accessCount
      }
    });

    // Return file with appropriate headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': metadata.mimeType,
        'Content-Disposition': `attachment; filename="${metadata.originalName}"`,
        'Content-Length': buffer.length.toString(),
        'X-File-ID': metadata.id,
        'X-Access-Count': metadata.accessCount.toString()
      }
    });

  } catch (error) {
    console.error('Secure download failed:', error);
    
    // Log failed access
    const securityMonitor = getSecurityMonitor();
    await securityMonitor.logSecurityEvent({
      type: 'file_access',
      severity: 'medium',
      source: 'SecureDownloadAPI',
      description: 'Failed to access secure file',
      metadata: {
        fileId: params.fileId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Download failed'
    }, { status: 500 });
  }
}

/**
 * DELETE /api/upload/secure/[fileId] - Delete secure file
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { fileId } = params;

    if (!fileId) {
      return NextResponse.json({
        success: false,
        error: 'File ID is required'
      }, { status: 400 });
    }

    const secureFileHandler = getSecureFileHandler();
    const metadata = secureFileHandler.getFileMetadata(fileId);
    
    if (!metadata) {
      return NextResponse.json({
        success: false,
        error: 'File not found'
      }, { status: 404 });
    }

    await secureFileHandler.deleteFile(fileId);

    // Log deletion
    const securityMonitor = getSecurityMonitor();
    await securityMonitor.logSecurityEvent({
      type: 'file_access',
      severity: 'low',
      source: 'SecureDeleteAPI',
      description: `Secure file deleted: ${metadata.originalName}`,
      metadata: {
        fileId: metadata.id,
        fileName: metadata.originalName
      }
    });

    return NextResponse.json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('Secure deletion failed:', error);
    
    // Log failed deletion
    const securityMonitor = getSecurityMonitor();
    await securityMonitor.logSecurityEvent({
      type: 'file_access',
      severity: 'medium',
      source: 'SecureDeleteAPI',
      description: 'Failed to delete secure file',
      metadata: {
        fileId: params.fileId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Deletion failed'
    }, { status: 500 });
  }
}

/**
 * GET /api/upload/secure/[fileId]/info - Get file metadata
 */
export async function HEAD(request: NextRequest, { params }: RouteParams) {
  try {
    const { fileId } = params;

    if (!fileId) {
      return NextResponse.json({
        success: false,
        error: 'File ID is required'
      }, { status: 400 });
    }

    const secureFileHandler = getSecureFileHandler();
    const metadata = secureFileHandler.getFileMetadata(fileId);

    if (!metadata) {
      return NextResponse.json({
        success: false,
        error: 'File not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      metadata: {
        id: metadata.id,
        originalName: metadata.originalName,
        size: metadata.size,
        mimeType: metadata.mimeType,
        encrypted: metadata.encrypted,
        createdAt: metadata.createdAt,
        expiresAt: metadata.expiresAt,
        accessCount: metadata.accessCount,
        lastAccessed: metadata.lastAccessed
      }
    });

  } catch (error) {
    console.error('Failed to get file metadata:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get file metadata'
    }, { status: 500 });
  }
}
