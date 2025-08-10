import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/db';
import { promises as fs } from 'fs';
import path from 'path';

interface AppSettings {
  general: {
    appName: string;
    autoConnect: boolean;
    notificationsEnabled: boolean;
    darkMode: boolean;
    language: string;
    timezone: string;
    maxFileSize: number; // MB
    maxConcurrentUploads: number;
  };
  upload: {
    defaultSendAsDocument: boolean;
    enableCompression: boolean;
    compressionLevel: number;
    maxRetries: number;
    chunkSize: number; // MB
    bandwidthLimit?: number; // bytes per second
  };
  whatsapp: {
    statusUpdateInterval: number; // minutes
    autoReconnect: boolean;
    maxReconnectAttempts: number;
    keepAlive: boolean;
    markOnlineOnConnect: boolean;
  };
  privacy: {
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    clearLogsAfterDays: number;
    clearHistoryAfterDays: number;
    clearTempFilesAfterHours: number;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  general: {
    appName: 'WhatsApp Status Handler',
    autoConnect: false,
    notificationsEnabled: true,
    darkMode: false,
    language: 'en',
    timezone: 'UTC',
    maxFileSize: 100,
    maxConcurrentUploads: 3,
  },
  upload: {
    defaultSendAsDocument: false,
    enableCompression: false,
    compressionLevel: 5,
    maxRetries: 3,
    chunkSize: 1,
    bandwidthLimit: undefined,
  },
  whatsapp: {
    statusUpdateInterval: 30,
    autoReconnect: true,
    maxReconnectAttempts: 5,
    keepAlive: true,
    markOnlineOnConnect: true,
  },
  privacy: {
    logLevel: 'info',
    clearLogsAfterDays: 30,
    clearHistoryAfterDays: 90,
    clearTempFilesAfterHours: 24,
  },
};

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'settings.json');

/**
 * GET /api/settings - Get application settings
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');

    const settings = await loadSettings();

    if (section && section in settings) {
      return NextResponse.json({
        success: true,
        settings: { [section]: settings[section as keyof AppSettings] },
        section,
      });
    }

    return NextResponse.json({
      success: true,
      settings,
    });

  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get settings',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * POST /api/settings - Update application settings
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { section, settings: newSettings } = body;

    if (!newSettings) {
      return NextResponse.json({
        success: false,
        error: 'Settings data is required',
      }, { status: 400 });
    }

    const currentSettings = await loadSettings();

    let updatedSettings = { ...currentSettings };

    if (section && section in updatedSettings) {
      // Update specific section
      updatedSettings[section as keyof AppSettings] = {
        ...updatedSettings[section as keyof AppSettings],
        ...newSettings,
      };
    } else {
      // Update entire settings object
      updatedSettings = {
        ...updatedSettings,
        ...newSettings,
      };
    }

    // Validate settings
    const validation = validateSettings(updatedSettings);
    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: 'Invalid settings',
        details: validation.errors,
      }, { status: 400 });
    }

    await saveSettings(updatedSettings);

    return NextResponse.json({
      success: true,
      message: section ? `${section} settings updated` : 'Settings updated successfully',
      settings: updatedSettings,
    });

  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update settings',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/settings - Reset settings to defaults
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');

    if (section && section in DEFAULT_SETTINGS) {
      // Reset specific section
      const currentSettings = await loadSettings();
      const updatedSettings = {
        ...currentSettings,
        [section]: DEFAULT_SETTINGS[section as keyof AppSettings],
      };
      
      await saveSettings(updatedSettings);
      
      return NextResponse.json({
        success: true,
        message: `${section} settings reset to defaults`,
        settings: updatedSettings,
      });
    } else {
      // Reset all settings
      await saveSettings(DEFAULT_SETTINGS);
      
      return NextResponse.json({
        success: true,
        message: 'All settings reset to defaults',
        settings: DEFAULT_SETTINGS,
      });
    }

  } catch (error) {
    console.error('Reset settings error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to reset settings',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * Load settings from file
 */
async function loadSettings(): Promise<AppSettings> {
  try {
    await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    
    // Merge with defaults to ensure all properties exist
    return {
      general: { ...DEFAULT_SETTINGS.general, ...parsed.general },
      upload: { ...DEFAULT_SETTINGS.upload, ...parsed.upload },
      whatsapp: { ...DEFAULT_SETTINGS.whatsapp, ...parsed.whatsapp },
      privacy: { ...DEFAULT_SETTINGS.privacy, ...parsed.privacy },
    };
  } catch (error) {
    // File doesn't exist or is corrupted, return defaults
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to file
 */
async function saveSettings(settings: AppSettings): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * Validate settings
 */
function validateSettings(settings: AppSettings): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate general settings
  if (settings.general.maxFileSize < 1 || settings.general.maxFileSize > 2048) {
    errors.push('Max file size must be between 1 and 2048 MB');
  }

  if (settings.general.maxConcurrentUploads < 1 || settings.general.maxConcurrentUploads > 10) {
    errors.push('Max concurrent uploads must be between 1 and 10');
  }

  // Validate upload settings
  if (settings.upload.compressionLevel < 1 || settings.upload.compressionLevel > 10) {
    errors.push('Compression level must be between 1 and 10');
  }

  if (settings.upload.maxRetries < 0 || settings.upload.maxRetries > 10) {
    errors.push('Max retries must be between 0 and 10');
  }

  if (settings.upload.chunkSize < 0.1 || settings.upload.chunkSize > 10) {
    errors.push('Chunk size must be between 0.1 and 10 MB');
  }

  // Validate WhatsApp settings
  if (settings.whatsapp.statusUpdateInterval < 1 || settings.whatsapp.statusUpdateInterval > 1440) {
    errors.push('Status update interval must be between 1 and 1440 minutes');
  }

  if (settings.whatsapp.maxReconnectAttempts < 0 || settings.whatsapp.maxReconnectAttempts > 20) {
    errors.push('Max reconnect attempts must be between 0 and 20');
  }

  // Validate privacy settings
  if (settings.privacy.clearLogsAfterDays < 1 || settings.privacy.clearLogsAfterDays > 365) {
    errors.push('Clear logs period must be between 1 and 365 days');
  }

  if (settings.privacy.clearHistoryAfterDays < 1 || settings.privacy.clearHistoryAfterDays > 365) {
    errors.push('Clear history period must be between 1 and 365 days');
  }

  if (settings.privacy.clearTempFilesAfterHours < 1 || settings.privacy.clearTempFilesAfterHours > 168) {
    errors.push('Clear temp files period must be between 1 and 168 hours');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
