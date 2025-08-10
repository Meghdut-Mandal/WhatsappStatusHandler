/**
 * Backup Management API
 * Week 4 - Developer A Implementation
 */

import { NextRequest, NextResponse } from 'next/server';
import { backupManager } from '@/lib/backup/BackupManager';
import { errorHandler, ErrorCategory } from '@/lib/errors/ErrorHandler';

/**
 * GET /api/backup - List all backups
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const backupId = searchParams.get('id');
    const verify = searchParams.get('verify') === 'true';

    if (backupId) {
      // Get specific backup info
      const backups = await backupManager.listBackups();
      const backup = backups.find(b => b.id === backupId);
      
      if (!backup) {
        return NextResponse.json({
          success: false,
          error: 'Backup not found'
        }, { status: 404 });
      }

      let verificationResult;
      if (verify) {
        const backupPath = require('path').join(
          process.cwd(), 'data', 'backups', backup.filename
        );
        verificationResult = await backupManager.verifyBackup(backupPath);
      }

      return NextResponse.json({
        success: true,
        backup,
        verification: verificationResult
      });
    }

    // List all backups
    const backups = await backupManager.listBackups();
    
    return NextResponse.json({
      success: true,
      backups,
      total: backups.length,
      totalSize: backups.reduce((sum, b) => sum + b.size, 0)
    });

  } catch (error) {
    const appError = errorHandler.handleError(error, {
      category: ErrorCategory.SYSTEM,
      severity: 'medium',
      context: { component: 'BackupAPI', action: 'list_backups' }
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to list backups',
      details: appError.userMessage,
      errorId: appError.id
    }, { status: 500 });
  }
}

/**
 * POST /api/backup - Create a new backup
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    
    const backupOptions = {
      includeSettings: body.includeSettings ?? true,
      includeSessions: body.includeSessions ?? true,
      includeSendHistory: body.includeSendHistory ?? true,
      includeMediaMeta: body.includeMediaMeta ?? true,
      includeFiles: body.includeFiles ?? false,
      compression: body.compression ?? true,
      encryption: body.encryption || { enabled: false }
    };

    // Create backup
    const backupInfo = await backupManager.createBackup(backupOptions);

    return NextResponse.json({
      success: true,
      message: 'Backup created successfully',
      backup: backupInfo
    });

  } catch (error) {
    const appError = errorHandler.handleError(error, {
      category: ErrorCategory.SYSTEM,
      severity: 'high',
      context: { component: 'BackupAPI', action: 'create_backup' }
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to create backup',
      details: appError.userMessage,
      errorId: appError.id
    }, { status: 500 });
  }
}

/**
 * DELETE /api/backup - Delete a backup
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const backupId = searchParams.get('id');

    if (!backupId) {
      return NextResponse.json({
        success: false,
        error: 'Backup ID is required'
      }, { status: 400 });
    }

    const deleted = await backupManager.deleteBackup(backupId);

    if (!deleted) {
      return NextResponse.json({
        success: false,
        error: 'Backup not found or could not be deleted'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Backup deleted successfully'
    });

  } catch (error) {
    const appError = errorHandler.handleError(error, {
      category: ErrorCategory.SYSTEM,
      severity: 'medium',
      context: { component: 'BackupAPI', action: 'delete_backup' }
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to delete backup',
      details: appError.userMessage,
      errorId: appError.id
    }, { status: 500 });
  }
}
