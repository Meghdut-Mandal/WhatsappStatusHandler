import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
import { SessionService } from '@/lib/db';

/**
 * POST /api/send/contact - Send media to specific WhatsApp contact
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files, caption, phoneNumber, sessionId } = body;

    // Validate required fields
    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Files array is required and must not be empty',
      }, { status: 400 });
    }

    if (!phoneNumber) {
      return NextResponse.json({
        success: false,
        error: 'Phone number is required',
      }, { status: 400 });
    }

    // Get or determine session ID
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const activeSession = await SessionService.getActive();
      if (!activeSession) {
        return NextResponse.json({
          success: false,
          error: 'No active WhatsApp session found. Please connect first.',
        }, { status: 400 });
      }
      activeSessionId = activeSession.id;
    }

    // Get Baileys manager and check connection
    const baileysManager = getBaileysManager();
    const connectionStatus = baileysManager.getConnectionStatus();
    
    if (connectionStatus.status !== 'connected') {
      return NextResponse.json({
        success: false,
        error: 'WhatsApp is not connected. Please connect first.',
        currentStatus: connectionStatus.status,
      }, { status: 400 });
    }

    // Get message sender
    const messageSender = baileysManager.getMessageSender();
    
    // Validate target contact (optional - simplified validation)
    const isValidTarget = await messageSender.validateTarget('contact', phoneNumber);
    if (!isValidTarget) {
      console.warn(`Warning: Contact ${phoneNumber} may not be valid`);
      // Continue anyway - WhatsApp will handle invalid numbers
    }
    
    // Send to contact
    const result = await messageSender.sendToContact({
      sessionId: activeSessionId,
      targetType: 'contact',
      targetIdentifier: phoneNumber,
      files,
      caption,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Media sent to contact successfully',
        result: {
          messageId: result.messageId,
          sentAt: result.sentAt,
          filesCount: files.length,
          phoneNumber,
          caption,
        },
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to send to contact',
        details: result.error,
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Contact send error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/send/contact - Get available contacts and sending capabilities
 */
export async function GET(_request: NextRequest) {
  try {
    // Check connection status
    const baileysManager = getBaileysManager();
    const connectionStatus = baileysManager.getConnectionStatus();
    
    const canSend = connectionStatus.status === 'connected';
    let contacts = [];
    
    if (canSend) {
      try {
        const messageSender = baileysManager.getMessageSender();
        contacts = await messageSender.getContacts();
      } catch (error) {
        console.error('Failed to get contacts:', error);
        // Continue without contacts - user can still input phone numbers manually
      }
    }
    
    // Get recent contact sends
    const { SendHistoryService } = await import('@/lib/db');
    const activeSession = await SessionService.getActive();
    
    let recentSends: any[] = [];
    if (activeSession) {
      recentSends = await SendHistoryService.getBySessionId(activeSession.id, {
        limit: 10,
      });
      
      // Filter for contact sends only
      recentSends = recentSends
        .filter(send => send.targetType === 'contact')
        .map((send: any) => ({
          id: send.id,
          phoneNumber: send.targetIdentifier,
          filesCount: (() => {
            const parsedFiles = typeof send.files === 'string' ? JSON.parse(send.files) : send.files;
            return Array.isArray(parsedFiles) ? parsedFiles.length : 0;
          })(),
          sentAt: send.completedAt || send.createdAt,
          status: send.status,
        }));
    }

    return NextResponse.json({
      success: true,
      capabilities: {
        canSend,
        connectionStatus: connectionStatus.status,
        whatsappUser: connectionStatus.session,
      },
      contacts: contacts.map((contact: any) => ({
        id: contact.id,
        name: contact.name || contact.notify,
        verifiedName: contact.verifiedName,
      })),
      recentSends,
    });

  } catch (error) {
    console.error('Contact capabilities error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get contact sending capabilities',
    }, { status: 500 });
  }
}
