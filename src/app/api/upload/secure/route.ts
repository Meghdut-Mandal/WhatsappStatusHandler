import { NextRequest, NextResponse } from 'next/server';
import { getSecureFileHandler } from '@/lib/security/SecureFileHandler';
import { getSecurityMonitor } from '@/lib/security/SecurityMonitor';

/**
 * POST /api/upload/secure - Upload file securely with encryption
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({
        success: false,
        error: 'Content-Type must be multipart/form-data'
      }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const encrypt = formData.get('encrypt') === 'true';
    const password = formData.get('password') as string;
    const autoCleanup = formData.get('autoCleanup') === 'true';
    const cleanupAfterMinutes = parseInt(formData.get('cleanupAfterMinutes') as string) || 60;

    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No file provided'
      }, { status: 400 });
    }

    // Validate file size (100MB limit)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      return NextResponse.json({
        success: false,
        error: `File size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`
      }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Get secure file handler
    const secureFileHandler = getSecureFileHandler();

    // Store file securely
    const metadata = await secureFileHandler.storeFile(fileBuffer, file.name, {
      encrypt,
      password: encrypt ? password : undefined,
      autoCleanup,
      cleanupAfterMinutes: autoCleanup ? cleanupAfterMinutes : undefined,
      maxFileSize: maxSize,
      allowedMimeTypes: [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
        'application/pdf', 'text/plain', 'application/json'
      ],
      quarantineOnSuspicious: true
    });

    // Log security event
    const securityMonitor = getSecurityMonitor();
    await securityMonitor.logSecurityEvent({
      type: 'file_access',
      severity: 'low',
      source: 'SecureUploadAPI',
      description: `File uploaded securely: ${file.name}`,
      metadata: {
        fileId: metadata.id,
        fileName: file.name,
        fileSize: file.size,
        encrypted: encrypt,
        autoCleanup
      }
    });

    return NextResponse.json({
      success: true,
      fileId: metadata.id,
      metadata: {
        id: metadata.id,
        originalName: metadata.originalName,
        size: metadata.size,
        mimeType: metadata.mimeType,
        encrypted: metadata.encrypted,
        createdAt: metadata.createdAt,
        expiresAt: metadata.expiresAt
      }
    });

  } catch (error) {
    console.error('Secure upload failed:', error);
    
    // Log security event for failed upload
    const securityMonitor = getSecurityMonitor();
    await securityMonitor.logSecurityEvent({
      type: 'file_access',
      severity: 'medium',
      source: 'SecureUploadAPI',
      description: 'Secure file upload failed',
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    }, { status: 500 });
  }
}

/**
 * GET /api/upload/secure - List secure files
 */
export async function GET() {
  try {
    const secureFileHandler = getSecureFileHandler();
    const files = secureFileHandler.listFiles();

    // Don't expose full paths in the response
    const safeFiles = files.map(file => ({
      id: file.id,
      originalName: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      encrypted: file.encrypted,
      createdAt: file.createdAt,
      expiresAt: file.expiresAt,
      accessCount: file.accessCount,
      lastAccessed: file.lastAccessed
    }));

    return NextResponse.json({
      success: true,
      files: safeFiles
    });

  } catch (error) {
    console.error('Failed to list secure files:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to list files'
    }, { status: 500 });
  }
}
