import { useEffect, useRef, useCallback } from 'react';

interface Contact {
  id: string;
  name?: string;
  pushName?: string;
  notify?: string;
  verifiedName?: string;
  status?: string;
  phoneNumber?: string;
  isBusiness: boolean;
  isMyContact: boolean;
  isBlocked: boolean;
  isFavorite: boolean;
  profilePicUrl?: string;
  lastSeen?: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string;
}

interface Group {
  id: string;
  subject: string;
  description?: string;
  owner?: string;
  creation?: number;
  size: number;
  participantCount: number;
  participants: number;
  canSend: boolean;
  profilePicUrl?: string;
  userRole?: string;
  isOwner: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string;
}

interface RealTimeEvent {
  timestamp: string;
  type?: string;
  contacts?: Contact[];
  groups?: Group[];
  message?: string;
  error?: string;
  status?: string;
}

interface UseRealTimeUpdatesOptions {
  onContactUpdate?: (data: RealTimeEvent) => void;
  onGroupUpdate?: (data: RealTimeEvent) => void;
  onSyncProgress?: (data: RealTimeEvent) => void;
  onSyncCompleted?: (data: RealTimeEvent) => void;
  onSyncFailed?: (data: RealTimeEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
  enabled?: boolean;
}

export function useRealTimeUpdates(options: UseRealTimeUpdatesOptions = {}) {
  const {
    onContactUpdate,
    onGroupUpdate,
    onSyncProgress,
    onSyncCompleted,
    onSyncFailed,
    onConnected,
    onDisconnected,
    onError,
    enabled = true
  } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000; // 1 second

  const connect = useCallback(() => {
    if (!enabled || eventSourceRef.current) {
      return;
    }

    try {
      const eventSource = new EventSource('/api/contacts/events');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('Real-time updates connected');
        reconnectAttemptsRef.current = 0;
        onConnected?.();
      };

      eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        console.log('Real-time connection established:', data.message);
      });

      eventSource.addEventListener('contact_update', (event) => {
        const data = JSON.parse(event.data);
        onContactUpdate?.(data);
      });

      eventSource.addEventListener('group_update', (event) => {
        const data = JSON.parse(event.data);
        onGroupUpdate?.(data);
      });

      eventSource.addEventListener('sync_progress', (event) => {
        const data = JSON.parse(event.data);
        onSyncProgress?.(data);
      });

      eventSource.addEventListener('sync_completed', (event) => {
        const data = JSON.parse(event.data);
        onSyncCompleted?.(data);
      });

      eventSource.addEventListener('sync_failed', (event) => {
        const data = JSON.parse(event.data);
        onSyncFailed?.(data);
      });

      eventSource.addEventListener('sync_notification', (event) => {
        const data = JSON.parse(event.data);
        // Handle sync notifications (success, error, warning)
        if (data.type === 'success' && onSyncCompleted) {
          onSyncCompleted(data);
        } else if (data.type === 'error' && onSyncFailed) {
          onSyncFailed(data);
        } else if (data.type === 'warning' && onError) {
          onError(data.message || 'Sync warning');
        }
      });

      eventSource.addEventListener('sync_warning', (event) => {
        const data = JSON.parse(event.data);
        console.warn('Sync warning:', data);
        onError?.(data.message || 'Sync warning occurred');
      });

      eventSource.addEventListener('sync_error', (event) => {
        const data = JSON.parse(event.data);
        console.error('Sync error:', data);
        onSyncFailed?.(data);
      });

      eventSource.addEventListener('error', (event) => {
        const data = JSON.parse(event.data);
        console.error('Real-time update error:', data.error);
        onError?.(data.error || 'Unknown error');
      });

      eventSource.addEventListener('heartbeat', (event) => {
        // Just acknowledge the heartbeat, no action needed
        const data = JSON.parse(event.data);
        console.debug('Heartbeat received:', data.timestamp);
      });

      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        
        // Close the current connection
        eventSource.close();
        eventSourceRef.current = null;
        onDisconnected?.();

        // Attempt to reconnect with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;
          
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          console.error('Max reconnection attempts reached');
          onError?.('Connection lost and unable to reconnect');
        }
      };

    } catch (error) {
      console.error('Failed to create EventSource:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to connect');
    }
  }, [enabled, onContactUpdate, onGroupUpdate, onSyncProgress, onSyncCompleted, onSyncFailed, onConnected, onDisconnected, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      onDisconnected?.();
    }
  }, [onDisconnected]);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [disconnect, connect]);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    connect,
    disconnect,
    reconnect,
    isConnected: eventSourceRef.current?.readyState === EventSource.OPEN
  };
}