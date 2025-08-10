import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { ContactManager, GroupFilters } from '@/lib/socketManager/ContactManager';

let contactManager: ContactManager | null = null;

function getContactManager() {
  const baileysManager = getBaileysManager();
  const socket = baileysManager.getSocket();
  
  if (!socket) {
    throw new Error('WhatsApp not connected');
  }
  
  if (!contactManager) {
    contactManager = new ContactManager(socket);
  }
  
  return contactManager;
}

/**
 * GET /api/groups - Get groups with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Check connection
    const baileysManager = getBaileysManager();
    const connectionStatus = baileysManager.getConnectionStatus();
    
    if (connectionStatus.status !== 'connected') {
      return NextResponse.json({
        success: false,
        error: 'WhatsApp is not connected',
        currentStatus: connectionStatus.status,
      }, { status: 400 });
    }

    const manager = getContactManager();

    // Parse query parameters
    const filters: GroupFilters = {
      search: searchParams.get('search') || undefined,
      isOwner: searchParams.get('isOwner') === 'true' ? true : 
               searchParams.get('isOwner') === 'false' ? false : undefined,
      isAdmin: searchParams.get('isAdmin') === 'true' ? true :
               searchParams.get('isAdmin') === 'false' ? false : undefined,
      canSend: searchParams.get('canSend') === 'true' ? true :
               searchParams.get('canSend') === 'false' ? false : undefined,
      minSize: searchParams.get('minSize') ? parseInt(searchParams.get('minSize')!) : undefined,
      maxSize: searchParams.get('maxSize') ? parseInt(searchParams.get('maxSize')!) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    };

    const groups = manager.getGroups(filters);
    const statistics = manager.getStatistics();

    return NextResponse.json({
      success: true,
      groups: groups.map(group => ({
        id: group.id,
        subject: group.subject,
        desc: group.desc,
        owner: group.owner,
        creation: group.creation,
        size: group.size,
        participants: group.participants.length,
        canSend: group.canSend,
        restrict: group.restrict,
        announce: group.announce,
        profilePicUrl: group.profilePicUrl,
        isOwner: group.owner === connectionStatus.session?.id,
        isAdmin: group.participants.find(p => 
          p.id === connectionStatus.session?.id && 
          (p.admin === 'admin' || p.admin === 'superadmin')
        ) !== undefined,
      })),
      pagination: {
        total: statistics.groups.total,
        returned: groups.length,
        offset: filters.offset || 0,
        limit: filters.limit || groups.length,
      },
      statistics: statistics.groups,
    });

  } catch (error) {
    console.error('Get groups error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get groups',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * POST /api/groups - Sync groups from WhatsApp
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { force = false } = body;

    const manager = getContactManager();
    
    const result = await manager.syncGroups();

    return NextResponse.json({
      success: true,
      message: 'Groups synced successfully',
      groupsCount: result,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Sync groups error:', error);
    
    if (error instanceof Error && error.message.includes('Recent sync exists')) {
      return NextResponse.json({
        success: false,
        error: error.message,
        suggestion: 'Use force=true to override recent sync',
      }, { status: 429 });
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to sync groups',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
