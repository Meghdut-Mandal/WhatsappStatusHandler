import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { ContactManager, GroupFilters } from '@/lib/socketManager/ContactManager';
import { GroupRepository } from '@/lib/db/group';
import { 
  createErrorResponse, 
  createSuccessResponse, 
  mapErrorToResponse,
  createValidationError,
  ERROR_CODES 
} from '@/lib/utils/api-errors';

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
 * GET /api/groups - Get groups with optional filtering (database-backed)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
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
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50, // Default limit
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0, // Default offset
    };

    // Validate pagination parameters
    if (filters.limit && (filters.limit < 1 || filters.limit > 1000)) {
      const errorResponse = createValidationError('limit', 'must be between 1 and 1000', filters.limit);
      return NextResponse.json(errorResponse, { status: 400 });
    }

    if (filters.offset && filters.offset < 0) {
      const errorResponse = createValidationError('offset', 'must be non-negative', filters.offset);
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Validate size filters
    if (filters.minSize && filters.minSize < 0) {
      const errorResponse = createValidationError('minSize', 'must be non-negative', filters.minSize);
      return NextResponse.json(errorResponse, { status: 400 });
    }

    if (filters.maxSize && filters.maxSize < 0) {
      const errorResponse = createValidationError('maxSize', 'must be non-negative', filters.maxSize);
      return NextResponse.json(errorResponse, { status: 400 });
    }

    if (filters.minSize && filters.maxSize && filters.minSize > filters.maxSize) {
      const errorResponse = createValidationError('minSize', 'cannot be greater than maxSize', 
        `minSize: ${filters.minSize}, maxSize: ${filters.maxSize}`);
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Try to get groups from database-backed ContactManager first
    let groups;
    let statistics;
    let fromDatabase = false;
    let currentUserId = null;

    try {
      // Check if WhatsApp is connected for ContactManager
      const baileysManager = getBaileysManager();
      const connectionStatus = baileysManager.getConnectionStatus();
      
      if (connectionStatus.status === 'connected') {
        const manager = getContactManager();
        groups = await manager.getGroups(filters);
        statistics = await manager.getStatistics();
        currentUserId = connectionStatus.session?.id;
      } else {
        // WhatsApp not connected, fall back to direct database access
        throw new Error('WhatsApp not connected, using direct database access');
      }
    } catch (error) {
      // Fallback to direct database access if ContactManager fails
      console.warn('ContactManager unavailable, using direct database access:', error);
      fromDatabase = true;
      
      const dbFilters = {
        isActive: true,
        search: filters.search,
        canSend: filters.canSend,
        minParticipants: filters.minSize,
        maxParticipants: filters.maxSize,
        limit: filters.limit,
        offset: filters.offset
      };

      // Handle user role filters
      if (filters.isOwner !== undefined || filters.isAdmin !== undefined) {
        if (filters.isOwner) {
          dbFilters.userRole = 'superadmin';
        } else if (filters.isAdmin) {
          dbFilters.userRole = 'admin';
        }
      }

      const [dbGroups, dbStatistics] = await Promise.all([
        GroupRepository.findAll(dbFilters),
        GroupRepository.getStatistics()
      ]);

      groups = dbGroups.map(dbGroup => ({
        id: dbGroup.id,
        subject: dbGroup.subject,
        desc: dbGroup.description || undefined,
        owner: dbGroup.owner || undefined,
        creation: dbGroup.creation ? Math.floor(dbGroup.creation.getTime() / 1000) : undefined,
        size: dbGroup.participantCount,
        participants: [], // Not available from database
        canSend: dbGroup.canSend || false,
        profilePicUrl: dbGroup.profilePicUrl || undefined,
        userRole: dbGroup.userRole,
        createdAt: dbGroup.createdAt,
        updatedAt: dbGroup.updatedAt,
        lastSyncAt: dbGroup.lastSyncAt,
      }));

      statistics = {
        groups: dbStatistics
      };
    }

    // Get total count for pagination (without limit/offset)
    const totalFilters = { ...filters };
    delete totalFilters.limit;
    delete totalFilters.offset;
    
    let totalCount;
    try {
      if (fromDatabase) {
        const dbFilters = {
          isActive: true,
          search: totalFilters.search,
          canSend: totalFilters.canSend,
          minParticipants: totalFilters.minSize,
          maxParticipants: totalFilters.maxSize
        };

        if (totalFilters.isOwner !== undefined || totalFilters.isAdmin !== undefined) {
          if (totalFilters.isOwner) {
            dbFilters.userRole = 'superadmin';
          } else if (totalFilters.isAdmin) {
            dbFilters.userRole = 'admin';
          }
        }

        totalCount = await GroupRepository.findAll(dbFilters).then(results => results.length);
      } else {
        totalCount = statistics.groups.total;
      }
    } catch (error) {
      console.error('Failed to get total count:', error);
      totalCount = groups.length;
    }

    return NextResponse.json({
      success: true,
      groups: groups.map(group => ({
        id: group.id,
        subject: group.subject,
        description: group.desc,
        owner: group.owner,
        creation: group.creation,
        size: group.size,
        participantCount: group.size,
        participants: group.participants?.length || 0,
        canSend: group.canSend,
        profilePicUrl: group.profilePicUrl,
        userRole: group.userRole,
        isOwner: group.userRole === 'superadmin' || (currentUserId && group.owner === currentUserId),
        isAdmin: group.userRole === 'admin' || group.userRole === 'superadmin',
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        lastSyncAt: group.lastSyncAt,
      })),
      pagination: {
        total: totalCount,
        returned: groups.length,
        offset: filters.offset || 0,
        limit: filters.limit || 50,
        hasMore: (filters.offset || 0) + groups.length < totalCount,
        page: Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1,
        totalPages: Math.ceil(totalCount / (filters.limit || 50))
      },
      statistics: statistics.groups,
      metadata: {
        fromDatabase,
        whatsappConnected: !fromDatabase,
        lastSync: statistics.lastSync || null,
        syncInProgress: statistics.syncInProgress || false,
        currentUserId
      }
    });

  } catch (error) {
    console.error('Get groups error:', error);
    const errorResponse = mapErrorToResponse(error);
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

/**
 * POST /api/groups - Sync groups from WhatsApp with database integration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { force = false, type = 'full' } = body;

    // Check WhatsApp connection
    const baileysManager = getBaileysManager();
    const connectionStatus = baileysManager.getConnectionStatus();
    
    if (connectionStatus.status !== 'connected') {
      const errorResponse = createErrorResponse(
        ERROR_CODES.WHATSAPP_DISCONNECTED,
        'WhatsApp is not connected',
        {
          suggestion: 'Please connect to WhatsApp first',
          actions: [
            {
              type: 'reconnect',
              label: 'Connect WhatsApp',
              endpoint: '/api/auth/qr',
              method: 'GET'
            }
          ],
          details: `Current status: ${connectionStatus.status}`
        }
      );
      return NextResponse.json(errorResponse, { status: 503 });
    }

    const manager = getContactManager();
    
    // Check if sync is already in progress
    const syncStatus = manager.getSyncStatus();
    if (syncStatus.inProgress) {
      const errorResponse = createErrorResponse(
        ERROR_CODES.SYNC_IN_PROGRESS,
        'Sync already in progress',
        {
          suggestion: 'Wait for current sync to complete or check sync status',
          actions: [
            {
              type: 'check_status',
              label: 'Check Status',
              endpoint: '/api/sync/status',
              method: 'GET'
            },
            {
              type: 'wait',
              label: 'Wait and Retry',
              delay: 30000
            }
          ],
          details: `Current sync: ${syncStatus.type}, started at ${syncStatus.startedAt}`
        }
      );
      return NextResponse.json(errorResponse, { status: 409 });
    }

    let result;

    try {
      if (type === 'incremental') {
        // Perform incremental sync
        result = await manager.incrementalSync();
        
        return NextResponse.json({
          success: true,
          message: 'Incremental group sync completed successfully',
          syncType: 'incremental',
          result: {
            groups: {
              updated: result.groups.updated,
              errors: result.groups.errors
            },
            duration: result.duration,
            timestamp: new Date().toISOString()
          },
          statistics: await manager.getStatistics()
        });
      } else {
        // Perform full sync (groups only)
        result = await manager.syncFromWhatsApp(force);
        
        return NextResponse.json({
          success: true,
          message: 'Full group sync completed successfully',
          syncType: 'full',
          result: {
            groups: {
              total: result.groups.total,
              new: result.groups.new,
              updated: result.groups.updated,
              errors: result.groups.errors
            },
            duration: result.duration,
            timestamp: new Date().toISOString()
          },
          statistics: await manager.getStatistics()
        });
      }

    } catch (syncError) {
      // Handle sync-specific errors with detailed reporting
      const errorResponse = mapErrorToResponse(syncError);
      const statusCode = errorResponse.code === ERROR_CODES.RECENT_SYNC_EXISTS ? 429 :
                        errorResponse.code === ERROR_CODES.SYNC_IN_PROGRESS ? 409 :
                        errorResponse.code === ERROR_CODES.WHATSAPP_DISCONNECTED ? 503 :
                        errorResponse.code === ERROR_CODES.DATABASE_ERROR ? 500 : 500;
      
      return NextResponse.json(errorResponse, { status: statusCode });
    }

  } catch (error) {
    console.error('Sync groups error:', error);
    const errorResponse = mapErrorToResponse(error);
    
    // Determine appropriate status code based on error type
    const statusCode = errorResponse.code === ERROR_CODES.PERMISSION_DENIED ? 403 :
                      errorResponse.code === ERROR_CODES.TIMEOUT_ERROR ? 504 :
                      errorResponse.code === ERROR_CODES.NETWORK_ERROR ? 502 :
                      errorResponse.code === ERROR_CODES.WHATSAPP_DISCONNECTED ? 503 : 500;
    
    return NextResponse.json(errorResponse, { status: statusCode });
  }
}
