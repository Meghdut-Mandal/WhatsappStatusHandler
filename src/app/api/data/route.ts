import { NextRequest, NextResponse } from 'next/server';
import { SessionService, SendHistoryService, MediaMetaService } from '@/lib/db';
import { promises as fs } from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { StreamingUploader } from '@/lib/uploader';
// Initialize WebSocket polyfills early
import '@/lib/init-websocket';

/**
 * GET /api/data - Export application data
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dataType = searchParams.get('type') || 'all'; // all, settings, history, contacts, sessions
    const format = searchParams.get('format') || 'json'; // json, zip
    const sessionId = searchParams.get('sessionId');

    interface ExportData {
      exportDate: string;
      version: string;
      dataType: string;
      settings?: any;
      sessions?: Array<{
        id: string;
        deviceName: string;
        createdAt: Date;
        lastSeenAt: Date | null;
        isActive: boolean;
      }>;
      sendHistory?: Array<{
        id: string;
        targetType: string;
        targetIdentifier: string;
        files: string[];
        status: string;
        createdAt: Date;
        completedAt: Date | null;
      }>;
      contacts?: {
        favorites: any[];
        broadcastLists: any[];
        note: string;
      };
    }

    const exportData: ExportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      dataType,
    };

    // Export settings
    if (dataType === 'all' || dataType === 'settings') {
      try {
        const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
        const settingsData = await fs.readFile(settingsPath, 'utf8');
        exportData.settings = JSON.parse(settingsData);
      } catch (error) {
        // Settings not available, skip
      }
    }

    // Export sessions
    if (dataType === 'all' || dataType === 'sessions') {
      const sessions = await SessionService.getAll();
      exportData.sessions = sessions.map(session => ({
        id: session.id,
        deviceName: session.deviceName,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        isActive: session.isActive,
        // Note: Don't export authBlob for security reasons
      }));
    }

    // Export send history
    if (dataType === 'all' || dataType === 'history') {
      let activeSessionId: string | null = sessionId;
      if (!activeSessionId) {
        const activeSession = await SessionService.getActive();
        activeSessionId = activeSession?.id || null;
      }

      if (activeSessionId) {
        const history = await SendHistoryService.getBySessionId(activeSessionId, { limit: 10000 });
        exportData.sendHistory = history.map(item => ({
          id: item.id,
          targetType: item.targetType,
          targetIdentifier: item.targetIdentifier,
          files: item.files,
          status: item.status,
          createdAt: item.createdAt,
          completedAt: item.completedAt,
        }));
      }
    }

    // Export contacts/groups data (placeholder - would integrate with ContactManager)
    if (dataType === 'all' || dataType === 'contacts') {
      exportData.contacts = {
        favorites: [], // Would get from ContactManager
        broadcastLists: [], // Would get from SendTargetingManager
        note: 'Contact data export requires active WhatsApp connection',
      };
    }

    // Handle different export formats
    if (format === 'zip') {
      const zip = new JSZip();
      
      // Add main export data
      zip.file('export.json', JSON.stringify(exportData, null, 2));
      
      // Add settings file if it exists
      if (exportData.settings) {
        zip.file('settings.json', JSON.stringify(exportData.settings, null, 2));
      }
      
      // Add send history as CSV if available
      if (exportData.sendHistory && exportData.sendHistory.length > 0) {
        const csv = convertHistoryToCSV(exportData.sendHistory);
        zip.file('send_history.csv', csv);
      }
      
      // Generate README
      const readme = generateExportReadme(exportData);
      zip.file('README.txt', readme);
      
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      
      return new NextResponse(zipBuffer as BodyInit, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="whatsapp_status_handler_export_${new Date().toISOString().split('T')[0]}.zip"`,
        },
      });
    } else {
      // JSON format
      return new NextResponse(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="whatsapp_status_handler_export_${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

  } catch (error) {
    console.error('Export data error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to export data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * POST /api/data - Import application data
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No file provided',
      }, { status: 400 });
    }

    const fileContent = await file.arrayBuffer();
    const buffer = Buffer.from(fileContent);
    
    let importData: ExportData;
    
    // Handle different file types
    if (file.name.endsWith('.zip')) {
      const zip = new JSZip();
      const zipData = await zip.loadAsync(buffer);
      
      // Try to find main export file
      const exportFile = zipData.file('export.json');
      if (!exportFile) {
        return NextResponse.json({
          success: false,
          error: 'Invalid export file - export.json not found in zip',
        }, { status: 400 });
      }
      
      const exportContent = await exportFile.async('text');
      importData = JSON.parse(exportContent);
    } else if (file.name.endsWith('.json')) {
      const jsonContent = buffer.toString('utf8');
      importData = JSON.parse(jsonContent);
    } else {
      return NextResponse.json({
        success: false,
        error: 'Unsupported file format. Please provide a JSON or ZIP file.',
      }, { status: 400 });
    }

    // Validate import data structure
    if (!importData.version || !importData.exportDate) {
      return NextResponse.json({
        success: false,
        error: 'Invalid export file format',
      }, { status: 400 });
    }

    const results = {
      settings: false,
      sessions: 0,
      sendHistory: 0,
      contacts: 0,
      errors: [] as string[],
    };

    // Import settings
    if (importData.settings) {
      try {
        const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
        await fs.mkdir(path.dirname(settingsPath), { recursive: true });
        await fs.writeFile(settingsPath, JSON.stringify(importData.settings, null, 2));
        results.settings = true;
      } catch (error) {
        results.errors.push(`Failed to import settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Import sessions (metadata only - auth data is not imported for security)
    if (importData.sessions && Array.isArray(importData.sessions)) {
      for (const sessionData of importData.sessions) {
        try {
          // Check if session already exists
          const existingSession = await SessionService.getById(sessionData.id);
          if (!existingSession) {
            await SessionService.create({
              deviceName: sessionData.deviceName + ' (Imported)',
              authBlob: undefined, // Don't import auth data
            });
            results.sessions++;
          }
        } catch (error) {
          results.errors.push(`Failed to import session ${sessionData.deviceName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Import send history
    if (importData.sendHistory && Array.isArray(importData.sendHistory)) {
      // Get or create a session for the imported history
      let targetSession = await SessionService.getActive();
      if (!targetSession) {
        targetSession = await SessionService.create({
          deviceName: 'Imported Session',
          authBlob: undefined,
        });
      }

      for (const historyItem of importData.sendHistory) {
        try {
          await SendHistoryService.create({
            sessionId: targetSession.id,
            targetType: historyItem.targetType,
            targetIdentifier: historyItem.targetIdentifier,
            files: historyItem.files,
            status: historyItem.status,
          });
          results.sendHistory++;
        } catch (error) {
          results.errors.push(`Failed to import history item: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Data imported successfully',
      results,
      importedFrom: {
        fileName: file.name,
        exportDate: importData.exportDate,
        dataType: importData.dataType,
      },
    });

  } catch (error) {
    console.error('Import data error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to import data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/data - Clear application data
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dataType = searchParams.get('type') || 'temp'; // all, history, temp, cache
    
    const results = {
      filesDeleted: 0,
      recordsDeleted: 0,
      errors: [] as string[],
    };

    switch (dataType) {
      case 'temp':
        // Clear temporary files
        try {
          const tempDir = path.join(process.cwd(), 'tmp');
          const files = await fs.readdir(tempDir, { recursive: true });
          let deletedFiles = 0;
          
          for (const file of files) {
            try {
              const filePath = path.join(tempDir, file as string);
              const stats = await fs.stat(filePath);
              if (stats.isFile()) {
                await fs.unlink(filePath);
                deletedFiles++;
              }
            } catch (error) {
              results.errors.push(`Failed to delete ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
          
          results.filesDeleted = deletedFiles;
        } catch (error) {
          results.errors.push(`Failed to clear temp files: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Also clear media metadata for temporary files
        try {
          const deletedMedia = await MediaMetaService.cleanupTemporary();
          results.recordsDeleted += deletedMedia;
        } catch (error) {
          results.errors.push(`Failed to clear media metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;

      case 'history':
        // Clear all send history
        try {
          const activeSession = await SessionService.getActive();
          if (activeSession) {
            const deletedHistory = await SendHistoryService.cleanup();
            results.recordsDeleted = deletedHistory;
          }
        } catch (error) {
          results.errors.push(`Failed to clear send history: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;

      case 'cache':
        // Clear upload progress cache
        try {
          StreamingUploader.cleanup();
          results.recordsDeleted = 1; // Symbolic, as we can't count cached items
        } catch (error) {
          results.errors.push(`Failed to clear upload cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;

      case 'all':
        // Clear everything (nuclear option)
        try {
          // Clear temp files
          const tempDir = path.join(process.cwd(), 'tmp');
          await fs.rm(tempDir, { recursive: true, force: true });
          await fs.mkdir(tempDir, { recursive: true });
          
          // Clear all database records
          const sessions = await SessionService.getAll();
          for (const session of sessions) {
            const historyItems = await SendHistoryService.getBySessionId(session.id);
            for (const item of historyItems) {
              await SendHistoryService.delete(item.id);
            }
            if (!session.isActive) {
              await SessionService.delete(session.id);
            }
          }
          
          // Clear media metadata
          const allMedia = await MediaMetaService.getAll();
          for (const media of allMedia) {
            await MediaMetaService.delete(media.id);
          }
          
          // Clear upload cache
          StreamingUploader.cleanup();
          
          results.filesDeleted = 999; // Symbolic
          results.recordsDeleted = 999; // Symbolic
        } catch (error) {
          results.errors.push(`Failed to clear all data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        break;

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid data type. Use: temp, history, cache, or all',
        }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `${dataType} data cleared successfully`,
      results,
    });

  } catch (error) {
    console.error('Clear data error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to clear data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * Helper functions
 */
function convertHistoryToCSV(history: Array<{
  id: string;
  targetType: string;
  targetIdentifier: string;
  files: string[];
  status: string;
  createdAt: Date;
  completedAt: Date | null;
}>): string {
  if (history.length === 0) return 'No data';
  
  const headers = ['ID', 'Target Type', 'Target ID', 'Files', 'Status', 'Created At', 'Completed At'];
  const rows = history.map(item => [
    item.id,
    item.targetType,
    item.targetIdentifier,
    Array.isArray(item.files) ? item.files.length : 0,
    item.status,
    item.createdAt,
    item.completedAt || '',
  ]);
  
  return [headers, ...rows].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
}

function generateExportReadme(exportData: ExportData): string {
  return `
WhatsApp Status Handler - Data Export
=====================================

Export Date: ${exportData.exportDate}
Export Type: ${exportData.dataType}
Version: ${exportData.version}

Contents:
---------
- export.json: Complete export data in JSON format
- settings.json: Application settings (if available)
- send_history.csv: Send history in CSV format (if available)

Import Instructions:
-------------------
1. Open WhatsApp Status Handler
2. Go to Settings > Data Management
3. Click "Import Data"
4. Select this ZIP file or the export.json file

Note: Session authentication data is not included in exports for security reasons.
You will need to reconnect to WhatsApp after importing.

Generated by WhatsApp Status Handler
`.trim();
}
