import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { ContactManager, ContactFilters } from '@/lib/socketManager/ContactManager';

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
 * GET /api/contacts - Get contacts with optional filtering
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
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
    };

    const contacts = manager.getContacts(filters);
    const statistics = manager.getStatistics();

    return NextResponse.json({
      success: true,
      contacts: contacts.map(contact => ({
        id: contact.id,
        name: contact.name,
        pushName: contact.pushName,
        notify: contact.notify,
        status: contact.status,
        isBusiness: contact.isBusiness,
        isMyContact: contact.isMyContact,
        isBlocked: contact.isBlocked,
        isFavorite: contact.isFavorite,
        profilePicUrl: contact.profilePicUrl,
        lastSeen: contact.lastSeen,
      })),
      pagination: {
        total: statistics.contacts.total,
        returned: contacts.length,
        offset: filters.offset || 0,
        limit: filters.limit || contacts.length,
      },
      statistics: statistics.contacts,
    });

  } catch (error) {
    console.error('Get contacts error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get contacts',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * POST /api/contacts - Sync contacts from WhatsApp
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { force = false } = body;

    const manager = getContactManager();
    
    const result = await manager.syncContacts();

    return NextResponse.json({
      success: true,
      message: 'Contacts synced successfully',
      contactsCount: result,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Sync contacts error:', error);
    
    if (error instanceof Error && error.message.includes('Recent sync exists')) {
      return NextResponse.json({
        success: false,
        error: error.message,
        suggestion: 'Use force=true to override recent sync',
      }, { status: 429 });
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to sync contacts',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
