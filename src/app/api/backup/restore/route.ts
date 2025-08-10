/**
 * Backup Restore API
 * Week 4 - Developer A Implementation
 */

import { NextRequest, NextResponse } from 'next/server';
import { backupManager } from '@/lib/backup/BackupManager';
import { errorHandler, ErrorCategory, ErrorSeverity } from '@/lib/errors/ErrorHandler';

/**
 * POST /api/backup/restore - Restore from backup file
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const overwrite = formData.get('overwrite') === 'true';
    const decryptionPassword = formData.get('password') as string || undefined;
    
    // Parse selective restore options
    const selectiveRestore = {
      includeSettings: formData.get('includeSettings') !== 'false',
      includeSessions: formData.get('includeSessions') !== 'false',
      includeSendHistory: formData.get('includeSendHistory') !== 'false',
      includeMediaMeta: formData.get('includeMediaMeta') !== 'false',
      includeFiles: formData.get('includeFiles') === 'true'
    };

    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No backup file provided'
      }, { status: 400 });
    }

    // Validate file type
    if (!file.name.endsWith('.json') && !file.name.endsWith('.zip')) {
      return NextResponse.json({
        success: false,
        error: 'Invalid file type. Only .json and .zip files are supported.'
      }, { status: 400 });
    }

    // Save uploaded file temporarily
    const tempDir = require('path').join(process.cwd(), 'tmp');
    const tempFilePath = require('path').join(tempDir, `restore_${Date.now()}_${file.name}`);
    
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await require('fs').promises.writeFile(tempFilePath, fileBuffer);

    try {
      // Verify backup before restoring
      const verification = await backupManager.verifyBackup(tempFilePath);
      if (!verification.valid) {
        return NextResponse.json({
          success: false,
          error: 'Backup file is invalid or corrupted',
          details: verification.errors
        }, { status: 400 });
      }

      // Restore backup
      const result = await backupManager.restoreBackup(tempFilePath, {
        overwrite,
        selectiveRestore,
        decryptionPassword
      });

      // Clean up temp file
      await require('fs').promises.unlink(tempFilePath).catch(() => {});

      return NextResponse.json({
        success: result.success,
        message: result.success ? 'Backup restored successfully' : 'Backup restore completed with errors',
        result
      });

    } catch (restoreError) {
      // Clean up temp file on error
      await require('fs').promises.unlink(tempFilePath).catch(() => {});
      throw restoreError;
    }

  } catch (error) {
    const appError = errorHandler.handleError(error, {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.HIGH,
      context: { component: 'BackupAPI', action: 'restore_backup' }
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to restore backup',
      details: appError.userMessage,
      errorId: appError.id
    }, { status: 500 });
  }
}
