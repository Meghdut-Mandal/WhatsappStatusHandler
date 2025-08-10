import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const PREFERENCES_FILE = path.join(process.cwd(), 'data', 'user_preferences.json');

// Ensure data directory exists
async function ensureDataDirectory() {
  const dataDir = path.dirname(PREFERENCES_FILE);
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
}

/**
 * GET /api/user/preferences - Get user preferences
 */
export async function GET() {
  try {
    await ensureDataDirectory();
    
    try {
      const data = await fs.readFile(PREFERENCES_FILE, 'utf8');
      const preferences = JSON.parse(data);
      
      return NextResponse.json({
        success: true,
        preferences
      });
    } catch (error) {
      // File doesn't exist or is invalid, return default preferences
      return NextResponse.json({
        success: true,
        preferences: {} // Will be merged with defaults on client
      });
    }

  } catch (error) {
    console.error('Failed to get user preferences:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get user preferences'
    }, { status: 500 });
  }
}

/**
 * POST /api/user/preferences - Update user preferences
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { preferences } = body;

    if (!preferences) {
      return NextResponse.json({
        success: false,
        error: 'Preferences are required'
      }, { status: 400 });
    }

    await ensureDataDirectory();
    
    // Save preferences to file
    await fs.writeFile(PREFERENCES_FILE, JSON.stringify(preferences, null, 2));

    return NextResponse.json({
      success: true,
      message: 'Preferences saved successfully'
    });

  } catch (error) {
    console.error('Failed to save user preferences:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to save user preferences'
    }, { status: 500 });
  }
}
