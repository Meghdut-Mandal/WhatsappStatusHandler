import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { ContactManager } from '@/lib/socketManager/ContactManager';

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
 * GET /api/contacts/favorites - Get favorite contacts
 */
export async function GET(request: NextRequest) {
  try {
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
    const favoriteContacts = manager.getFavoriteContacts();

    return NextResponse.json({
      success: true,
      favorites: favoriteContacts.map(contact => ({
        id: contact.id,
        name: contact.name,
        pushName: contact.pushName,
        notify: contact.notify,
        status: contact.status,
        isBusiness: contact.isBusiness,
        isMyContact: contact.isMyContact,
        profilePicUrl: contact.profilePicUrl,
        lastSeen: contact.lastSeen,
      })),
      count: favoriteContacts.length,
    });

  } catch (error) {
    console.error('Get favorite contacts error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get favorite contacts',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * POST /api/contacts/favorites - Add contact to favorites
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await request.json();
    const { contactId } = body;

    if (!contactId) {
      return NextResponse.json({
        success: false,
        error: 'contactId is required',
      }, { status: 400 });
    }

    const manager = getContactManager();
    const added = await manager.addToFavorites(contactId);

    if (added) {
      return NextResponse.json({
        success: true,
        message: 'Contact added to favorites',
        contactId,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Contact not found',
        contactId,
      }, { status: 404 });
    }

  } catch (error) {
    console.error('Add to favorites error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to add contact to favorites',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/contacts/favorites - Remove contact from favorites
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contactId');

    if (!contactId) {
      return NextResponse.json({
        success: false,
        error: 'contactId parameter is required',
      }, { status: 400 });
    }

    const manager = getContactManager();
    const removed = await manager.removeFromFavorites(contactId);

    if (removed) {
      return NextResponse.json({
        success: true,
        message: 'Contact removed from favorites',
        contactId,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Contact not found or not in favorites',
        contactId,
      }, { status: 404 });
    }

  } catch (error) {
    console.error('Remove from favorites error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to remove contact from favorites',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
