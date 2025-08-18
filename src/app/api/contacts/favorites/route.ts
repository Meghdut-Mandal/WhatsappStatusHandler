import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { ContactManager } from '@/lib/socketManager/ContactManager';
import { ContactRepository } from '@/lib/db/contact';
import { 
  createErrorResponse, 
  createSuccessResponse, 
  mapErrorToResponse,
  createValidationError,
  createNotFoundError,
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
 * GET /api/contacts/favorites - Get favorite contacts (database-backed)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse pagination parameters
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;
    const search = searchParams.get('search') || undefined;

    // Validate pagination parameters
    if (limit < 1 || limit > 1000) {
      const errorResponse = createValidationError('limit', 'must be between 1 and 1000', limit);
      return NextResponse.json(errorResponse, { status: 400 });
    }

    if (offset < 0) {
      const errorResponse = createValidationError('offset', 'must be non-negative', offset);
      return NextResponse.json(errorResponse, { status: 400 });
    }

    let favoriteContacts;
    let fromDatabase = false;

    try {
      // Try to use ContactManager first if WhatsApp is connected
      const baileysManager = getBaileysManager();
      const connectionStatus = baileysManager.getConnectionStatus();
      
      if (connectionStatus.status === 'connected') {
        const manager = getContactManager();
        favoriteContacts = await manager.getContacts({ 
          isFavorite: true, 
          search,
          limit, 
          offset 
        });
      } else {
        throw new Error('WhatsApp not connected, using direct database access');
      }
    } catch (error) {
      // Fallback to direct database access
      console.warn('ContactManager unavailable, using direct database access:', error);
      fromDatabase = true;
      
      const dbContacts = await ContactRepository.findAll({
        isActive: true,
        isFavorite: true,
        search,
        limit,
        offset
      });

      favoriteContacts = dbContacts.map(dbContact => ({
        id: dbContact.id,
        name: dbContact.name || undefined,
        pushName: dbContact.pushName || undefined,
        notify: dbContact.notify || undefined,
        verifiedName: dbContact.verifiedName || undefined,
        status: dbContact.status || undefined,
        phoneNumber: dbContact.phoneNumber || undefined,
        isBusiness: dbContact.isBusiness,
        isMyContact: dbContact.isMyContact,
        isBlocked: dbContact.isBlocked,
        isFavorite: dbContact.isFavorite,
        profilePicUrl: dbContact.profilePicUrl || undefined,
        lastSeen: dbContact.lastSeen || undefined,
        createdAt: dbContact.createdAt,
        updatedAt: dbContact.updatedAt,
        lastSyncAt: dbContact.lastSyncAt,
      }));
    }

    // Get total count of favorites for pagination
    const totalFavorites = await ContactRepository.findAll({
      isActive: true,
      isFavorite: true,
      search
    }).then(results => results.length);

    return NextResponse.json({
      success: true,
      favorites: favoriteContacts.map(contact => ({
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
        total: totalFavorites,
        returned: favoriteContacts.length,
        offset,
        limit,
        hasMore: offset + favoriteContacts.length < totalFavorites,
        page: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(totalFavorites / limit)
      },
      metadata: {
        fromDatabase,
        whatsappConnected: !fromDatabase
      }
    });

  } catch (error) {
    console.error('Get favorite contacts error:', error);
    const errorResponse = mapErrorToResponse(error);
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

/**
 * POST /api/contacts/favorites - Add contact(s) to favorites with database persistence
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contactId, contactIds } = body;

    // Support both single contact and bulk operations
    const idsToProcess = contactIds || (contactId ? [contactId] : []);

    if (!idsToProcess || idsToProcess.length === 0) {
      const errorResponse = createValidationError('contactId', 'contactId or contactIds array is required');
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Validate contactIds array
    if (!Array.isArray(idsToProcess)) {
      const errorResponse = createValidationError('contactIds', 'must be an array', typeof idsToProcess);
      return NextResponse.json(errorResponse, { status: 400 });
    }

    if (idsToProcess.length > 100) {
      const errorResponse = createValidationError('contactIds', 'cannot process more than 100 contacts at once', idsToProcess.length);
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const results = {
      success: [],
      failed: [],
      notFound: []
    };

    // Process each contact
    for (const id of idsToProcess) {
      try {
        // Check if contact exists in database
        const existingContact = await ContactRepository.findById(id);
        
        if (!existingContact) {
          results.notFound.push(id);
          continue;
        }

        // Toggle favorite status using repository
        const updatedContact = await ContactRepository.toggleFavorite(id);
        
        // Update ContactManager cache if available
        try {
          const baileysManager = getBaileysManager();
          const connectionStatus = baileysManager.getConnectionStatus();
          
          if (connectionStatus.status === 'connected') {
            const manager = getContactManager();
            if (updatedContact.isFavorite) {
              await manager.addToFavorites(id);
            } else {
              await manager.removeFromFavorites(id);
            }
          }
        } catch (managerError) {
          // ContactManager update failed, but database update succeeded
          console.warn('Failed to update ContactManager cache:', managerError);
        }

        results.success.push({
          contactId: id,
          isFavorite: updatedContact.isFavorite,
          name: updatedContact.name || updatedContact.pushName || id
        });

      } catch (error) {
        console.error(`Failed to toggle favorite for contact ${id}:`, error);
        results.failed.push({
          contactId: id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const isSuccess = results.success.length > 0;
    const statusCode = isSuccess ? (results.failed.length > 0 ? 207 : 200) : 404;

    return NextResponse.json({
      success: isSuccess,
      message: `Processed ${idsToProcess.length} contact(s)`,
      results: {
        total: idsToProcess.length,
        successful: results.success.length,
        failed: results.failed.length,
        notFound: results.notFound.length
      },
      details: {
        success: results.success,
        failed: results.failed,
        notFound: results.notFound
      }
    }, { status: statusCode });

  } catch (error) {
    console.error('Add to favorites error:', error);
    const errorResponse = mapErrorToResponse(error);
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

/**
 * DELETE /api/contacts/favorites - Remove contact(s) from favorites with database persistence
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contactId');
    
    // Also support bulk delete via request body
    let contactIds = [];
    try {
      const body = await request.json();
      contactIds = body.contactIds || [];
    } catch {
      // No body provided, use query parameter
      contactIds = contactId ? [contactId] : [];
    }

    if (contactIds.length === 0) {
      const errorResponse = createValidationError('contactId', 'contactId parameter or contactIds array in body is required');
      return NextResponse.json(errorResponse, { status: 400 });
    }

    if (contactIds.length > 100) {
      const errorResponse = createValidationError('contactIds', 'cannot process more than 100 contacts at once', contactIds.length);
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const results = {
      success: [],
      failed: [],
      notFound: []
    };

    // Process each contact
    for (const id of contactIds) {
      try {
        // Check if contact exists and is favorited
        const existingContact = await ContactRepository.findById(id);
        
        if (!existingContact) {
          results.notFound.push(id);
          continue;
        }

        if (!existingContact.isFavorite) {
          results.failed.push({
            contactId: id,
            error: 'Contact is not in favorites'
          });
          continue;
        }

        // Remove from favorites using repository
        const updatedContact = await ContactRepository.update(id, {
          isFavorite: false
        });
        
        // Update ContactManager cache if available
        try {
          const baileysManager = getBaileysManager();
          const connectionStatus = baileysManager.getConnectionStatus();
          
          if (connectionStatus.status === 'connected') {
            const manager = getContactManager();
            await manager.removeFromFavorites(id);
          }
        } catch (managerError) {
          // ContactManager update failed, but database update succeeded
          console.warn('Failed to update ContactManager cache:', managerError);
        }

        results.success.push({
          contactId: id,
          isFavorite: false,
          name: updatedContact.name || updatedContact.pushName || id
        });

      } catch (error) {
        console.error(`Failed to remove favorite for contact ${id}:`, error);
        results.failed.push({
          contactId: id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const isSuccess = results.success.length > 0;
    const statusCode = isSuccess ? (results.failed.length > 0 ? 207 : 200) : 404;

    return NextResponse.json({
      success: isSuccess,
      message: `Processed ${contactIds.length} contact(s)`,
      results: {
        total: contactIds.length,
        successful: results.success.length,
        failed: results.failed.length,
        notFound: results.notFound.length
      },
      details: {
        success: results.success,
        failed: results.failed,
        notFound: results.notFound
      }
    }, { status: statusCode });

  } catch (error) {
    console.error('Remove from favorites error:', error);
    const errorResponse = mapErrorToResponse(error);
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
