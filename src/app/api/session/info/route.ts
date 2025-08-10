import { NextRequest, NextResponse } from 'next/server';
import { SessionService, SendHistoryService } from '@/lib/db';
import { getBaileysManager } from '@/lib/socketManager';

/**
 * GET /api/session/info - Get current session information
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const includeHistory = searchParams.get('includeHistory') === 'true';
    const includeStats = searchParams.get('includeStats') === 'true';
    
    let session;
    
    if (sessionId) {
      // Get specific session
      session = includeHistory 
        ? await SessionService.getWithHistory(sessionId)
        : await SessionService.getById(sessionId);
    } else {
      // Get active session
      session = await SessionService.getActive();
      
      if (session && includeHistory) {
        const sessionWithHistory = await SessionService.getWithHistory(session.id);
        session = sessionWithHistory;
      }
    }
    
    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'Session not found',
      }, { status: 404 });
    }
    
    // Get connection status from Baileys manager
    const baileysManager = getBaileysManager();
    const connectionStatus = baileysManager.getConnectionStatus();
    
    // Prepare response
    const response: any = {
      success: true,
      session: {
        id: session.id,
        deviceName: session.deviceName,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        isActive: session.isActive,
        connectionStatus: connectionStatus.status,
        whatsappUser: connectionStatus.session,
      },
    };
    
    // Include send history if requested
    if (includeHistory && 'sendHistory' in session) {
      response.session.sendHistory = session.sendHistory;
    }
    
    // Include statistics if requested
    if (includeStats) {
      const stats = await SendHistoryService.getStats(session.id);
      response.session.statistics = stats;
    }
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Session info error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get session information',
    }, { status: 500 });
  }
}

/**
 * PUT /api/session/info - Update session information
 */
export async function PUT(request: NextRequest) {
  try {
    const { sessionId, deviceName } = await request.json();
    
    if (!sessionId) {
      return NextResponse.json({
        success: false,
        error: 'Session ID is required',
      }, { status: 400 });
    }
    
    const updateData: any = {};
    if (deviceName) updateData.deviceName = deviceName;
    
    const updatedSession = await SessionService.update(sessionId, updateData);
    
    return NextResponse.json({
      success: true,
      message: 'Session updated successfully',
      session: {
        id: updatedSession.id,
        deviceName: updatedSession.deviceName,
        createdAt: updatedSession.createdAt,
        lastSeenAt: updatedSession.lastSeenAt,
        isActive: updatedSession.isActive,
      },
    });
    
  } catch (error) {
    console.error('Session update error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update session',
    }, { status: 500 });
  }
}

/**
 * GET /api/session/info/all - Get all sessions
 */
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    if (action === 'get_all') {
      const sessions = await SessionService.getAll();
      
      return NextResponse.json({
        success: true,
        sessions: sessions.map(session => ({
          id: session.id,
          deviceName: session.deviceName,
          createdAt: session.createdAt,
          lastSeenAt: session.lastSeenAt,
          isActive: session.isActive,
        })),
      });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Invalid action',
    }, { status: 400 });
    
  } catch (error) {
    console.error('Sessions list error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get sessions list',
    }, { status: 500 });
  }
}
