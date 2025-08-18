import { NextRequest } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';

function getContactManager() {
  const baileysManager = getBaileysManager();
  const contactManager = baileysManager.getContactManager();
  
  if (!contactManager) {
    throw new Error('WhatsApp not connected or ContactManager not initialized');
  }
  
  return contactManager;
}

/**
 * GET /api/contacts/events - Server-Sent Events for real-time contact updates
 */
export async function GET(request: NextRequest) {
  // Check if client accepts Server-Sent Events
  const accept = request.headers.get('accept');
  if (!accept?.includes('text/event-stream')) {
    return new Response('This endpoint only supports Server-Sent Events', { 
      status: 400,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const encoder = new TextEncoder();
      
      const sendEvent = (event: string, data: Record<string, unknown>) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send connection established event
      sendEvent('connected', { 
        timestamp: new Date().toISOString(),
        message: 'Real-time updates connected'
      });

      try {
        const manager = getContactManager();
        
        // Set up event listeners for real-time updates
        const handleContactUpdate = (data: Record<string, unknown>) => {
          sendEvent('contact_update', {
            timestamp: new Date().toISOString(),
            ...data
          });
        };

        const handleGroupUpdate = (data: Record<string, unknown>) => {
          sendEvent('group_update', {
            timestamp: new Date().toISOString(),
            ...data
          });
        };

        const handleSyncProgress = (data: Record<string, unknown>) => {
          sendEvent('sync_progress', {
            timestamp: new Date().toISOString(),
            ...data
          });
        };

        const handleSyncCompleted = (data: Record<string, unknown>) => {
          sendEvent('sync_completed', {
            timestamp: new Date().toISOString(),
            ...data
          });
        };

        const handleSyncFailed = (data: Record<string, unknown>) => {
          sendEvent('sync_failed', {
            timestamp: new Date().toISOString(),
            ...data
          });
        };

        const handleSyncNotification = (data: Record<string, unknown>) => {
          sendEvent('sync_notification', {
            timestamp: new Date().toISOString(),
            ...data
          });
        };

        const handleSyncWarning = (data: Record<string, unknown>) => {
          sendEvent('sync_warning', {
            timestamp: new Date().toISOString(),
            ...data
          });
        };

        const handleSyncError = (data: Record<string, unknown>) => {
          sendEvent('sync_error', {
            timestamp: new Date().toISOString(),
            ...data
          });
        };

        // Register event listeners
        manager.on('realtime_contact_update', handleContactUpdate);
        manager.on('realtime_group_update', handleGroupUpdate);
        manager.on('sync_progress', handleSyncProgress);
        manager.on('auto_sync_started', handleSyncProgress);
        manager.on('periodic_sync_started', handleSyncProgress);
        manager.on('auto_sync_completed', handleSyncCompleted);
        manager.on('sync_completed', handleSyncCompleted);
        manager.on('auto_sync_failed', handleSyncFailed);
        manager.on('sync_failed', handleSyncFailed);
        manager.on('sync_notification', handleSyncNotification);
        manager.on('sync_warning', handleSyncWarning);
        manager.on('sync_error', handleSyncError);

        // Send periodic heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
          sendEvent('heartbeat', { 
            timestamp: new Date().toISOString(),
            status: 'alive'
          });
        }, 30000); // Every 30 seconds

        // Clean up when client disconnects
        const cleanup = () => {
          try {
            clearInterval(heartbeatInterval);
            manager.off('realtime_contact_update', handleContactUpdate);
            manager.off('realtime_group_update', handleGroupUpdate);
            manager.off('sync_progress', handleSyncProgress);
            manager.off('auto_sync_started', handleSyncProgress);
            manager.off('periodic_sync_started', handleSyncProgress);
            manager.off('auto_sync_completed', handleSyncCompleted);
            manager.off('sync_completed', handleSyncCompleted);
            manager.off('auto_sync_failed', handleSyncFailed);
            manager.off('sync_failed', handleSyncFailed);
            manager.off('sync_notification', handleSyncNotification);
            manager.off('sync_warning', handleSyncWarning);
            manager.off('sync_error', handleSyncError);
          } catch (error) {
            console.error('Error during SSE cleanup:', error);
          }
        };

        // Handle client disconnect
        request.signal.addEventListener('abort', cleanup);
        
        // Ensure cleanup on stream end
        controller.closed?.then?.(cleanup).catch?.(cleanup);

      } catch (error) {
        console.error('Failed to set up real-time events:', error);
        sendEvent('error', {
          timestamp: new Date().toISOString(),
          error: 'Failed to connect to WhatsApp',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}