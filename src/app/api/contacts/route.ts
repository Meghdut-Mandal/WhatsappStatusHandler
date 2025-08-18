import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { ContactManager, ContactFilters } from '@/lib/socketManager/ContactManager';
import { ContactRepository } from '@/lib/db/contact';
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
 * GET /api/contacts - Get contacts with optional filtering (database-backed)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const filters: ContactFilters = {
      search: searchParams.get('search') || undefined,
      isMyContact: searchParams.get('isMyContact') === 'true' ? true : 
                   searchParams.get('isMyContact') === 'false' ? false : undefined,
      isBlocked: searchParams.get('isBlocked') === 'true' ? true :
                 searchParams.get('isBlocked') === 'false' ? false : undefined,
      isBusiness: searchParams.get('isBusiness') === 'true' ? true :
                  searchParams.get('isBusiness') === 'false' ? false : undefined,
      isFavorite: searchParams.get('isFavorite') === 'true' ? true :
                  searchParams.get('isFavorite') === 'false' ? false : undefined,
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

    // Try to get contacts from database-backed ContactManager first
    let contacts;
    let statistics;
    let fromDatabase = true;

    try {
      // Check if WhatsApp is connected for ContactManager
      const baileysManager = getBaileysManager();
      const connectionStatus = baileysManager.getConnectionStatus();
      
      if (connectionStatus.status === 'connected') {
        const manager = getContactManager();
        contacts = await manager.getContacts(filters);
        statistics = await manager.getStatistics();
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
        isMyContact: filters.isMyContact,
        isBusiness: filters.isBusiness,
        isFavorite: filters.isFavorite,
        limit: filters.limit,
        offset: filters.offset
      };

      const [dbContacts, dbStatistics] = await Promise.all([
        ContactRepository.findAll(dbFilters),
        ContactRepository.getStatistics()
      ]);

      contacts = dbContacts.map(dbContact => ({
        id: dbContact.id,
        name: dbContact.name || undefined,
        pushName: dbContact.pushName || undefined,
        notify: dbContact.notify || undefined,
        verifiedName: dbContact.verifiedName || undefined,
        status: dbContact.status || undefined,
        isBusiness: dbContact.isBusiness,
        isMyContact: dbContact.isMyContact,
        isBlocked: dbContact.isBlocked,
        isFavorite: dbContact.isFavorite,
        profilePicUrl: dbContact.profilePicUrl || undefined,
        lastSeen: dbContact.lastSeen || undefined,
      }));

      statistics = {
        contacts: dbStatistics
      };
    }

    // Get total count for pagination (without limit/offset)
    const totalFilters = { ...filters };
    delete totalFilters.limit;
    delete totalFilters.offset;
    
    let totalCount;
    try {
      if (fromDatabase) {
        totalCount = await ContactRepository.findAll({
          isActive: true,
          search: totalFilters.search,
          isMyContact: totalFilters.isMyContact,
          isBusiness: totalFilters.isBusiness,
          isFavorite: totalFilters.isFavorite
        }).then(results => results.length);
      } else {
        totalCount = statistics.contacts.total;
      }
    } catch (error) {
      console.error('Failed to get total count:', error);
      totalCount = contacts.length;
    }

    return NextResponse.json({
      success: true,
      contacts: contacts.map(contact => ({
        id: contact.id,
        name: contact.name,
        pushName: contact.pushName,
        notify: contact.notify,
        verifiedName: contact.verifiedName,
        status: contact.status,
        phoneNumber: contact.phoneNumber,
        isBusiness: contact.isBusiness,
        isMyContact: contact.isMyContact,
        isBlocked: contact.isBlocked,
        isFavorite: contact.isFavorite,
        profilePicUrl: contact.profilePicUrl,
        lastSeen: contact.lastSeen,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
        lastSyncAt: contact.lastSyncAt,
      })),
      pagination: {
        total: totalCount,
        returned: contacts.length,
        offset: filters.offset || 0,
        limit: filters.limit || 50,
        hasMore: (filters.offset || 0) + contacts.length < totalCount,
        page: Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1,
        totalPages: Math.ceil(totalCount / (filters.limit || 50))
      },
      statistics: statistics.contacts,
      metadata: {
        fromDatabase,
        whatsappConnected: !fromDatabase,
        lastSync: statistics.lastSync || null,
        syncInProgress: statistics.syncInProgress || false
      }
    });

  } catch (error) {
    console.error('Get contacts error:', error);
    const errorResponse = mapErrorToResponse(error);
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

/**
 * POST /api/contacts - Sync contacts from WhatsApp with database integration
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
    const startTime = Date.now();

    try {
      if (type === 'incremental') {
        // Perform incremental sync
        result = await manager.incrementalSync();
        
        return NextResponse.json({
          success: true,
          message: 'Incremental sync completed successfully',
          syncType: 'incremental',
          result: {
            contacts: {
              updated: result.contacts.updated,
              errors: result.contacts.errors
            },
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
        // Perform full sync
        result = await manager.syncFromWhatsApp(force);
        
        return NextResponse.json({
          success: true,
          message: 'Full sync completed successfully',
          syncType: 'full',
          result: {
            contacts: {
              total: result.contacts.total,
              new: result.contacts.new,
              updated: result.contacts.updated,
              errors: result.contacts.errors
            },
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
    console.error('Sync contacts error:', error);
    const errorResponse = mapErrorToResponse(error);
    
    // Determine appropriate status code based on error type
    const statusCode = errorResponse.code === ERROR_CODES.PERMISSION_DENIED ? 403 :
                      errorResponse.code === ERROR_CODES.TIMEOUT_ERROR ? 504 :
                      errorResponse.code === ERROR_CODES.NETWORK_ERROR ? 502 :
                      errorResponse.code === ERROR_CODES.WHATSAPP_DISCONNECTED ? 503 : 500;
    
    return NextResponse.json(errorResponse, { status: statusCode });
  }
}
