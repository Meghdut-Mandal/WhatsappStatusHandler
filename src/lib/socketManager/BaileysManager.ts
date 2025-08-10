import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  ConnectionState,
  WASocket,
  BaileysEventMap,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { SessionService } from '../db';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { ConnectionStabilizer } from './ConnectionStabilizer';
import { errorHandler, ErrorCategory } from '../errors/ErrorHandler';
import { initializeWebSocketPolyfills, isWebSocketPolyfillReady } from '../utils/websocket-polyfill';
import { logWebSocketFixTest } from '../utils/test-websocket-fix';

export interface ConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'qr_required' | 'error';
  qrCode?: string;
  session?: { id?: string; name?: string; [key: string]: unknown };
  error?: string;
}

export class BaileysManager extends EventEmitter {
  private socket: WASocket | null = null;
  private sessionId: string | null = null;
  private authDir: string;
  private connectionStatus: ConnectionStatus = { status: 'disconnected' };
  private connectionStabilizer: ConnectionStabilizer;
  private sessionRecoveryAttempts = 0;
  private maxSessionRecoveryAttempts = 3;

  constructor() {
    super();
    
    // Initialize WebSocket polyfills before any socket operations
    initializeWebSocketPolyfills();
    
    // Verify polyfills are ready
    if (!isWebSocketPolyfillReady()) {
      console.warn('WebSocket polyfills may not be fully initialized');
    } else {
      console.log('WebSocket polyfills initialized successfully in BaileysManager');
    }
    
    // Run WebSocket fix test in development mode
    if (process.env.NODE_ENV === 'development') {
      logWebSocketFixTest();
    }
    
    this.authDir = path.join(process.cwd(), 'data', 'auth_sessions');
    this.connectionStabilizer = new ConnectionStabilizer();
    this.setupStabilizerEventHandlers();
    this.ensureAuthDir();
  }

  /**
   * Setup connection stabilizer event handlers
   */
  private setupStabilizerEventHandlers(): void {
    this.connectionStabilizer.on('reconnect_attempt', (data) => {
      console.log(`Reconnect attempt ${data.attempt}/${data.maxAttempts}`);
      this.initialize(this.sessionId);
    });

    this.connectionStabilizer.on('connection_stabilized', () => {
      console.log('WhatsApp connection stabilized');
    });

    this.connectionStabilizer.on('max_reconnect_attempts_reached', () => {
      console.warn('Max reconnect attempts reached, connection abandoned');
      this.connectionStatus = { status: 'error', error: 'Max reconnect attempts reached' };
      this.emit('status_update', this.connectionStatus);
    });

    this.connectionStabilizer.on('connection_abandoned', (data) => {
      console.warn('Connection abandoned:', data.reason);
      this.connectionStatus = { status: 'error', error: `Connection abandoned: ${data.reason}` };
      this.emit('status_update', this.connectionStatus);
    });

    this.connectionStabilizer.on('connection_error', (appError) => {
      console.error('Connection error:', appError.message);
      this.emit('connection_error', appError);
    });
  }

  /**
   * Ensure auth directory exists
   */
  private async ensureAuthDir() {
    try {
      await fs.mkdir(this.authDir, { recursive: true });
    } catch (error) {
      errorHandler.handleError(error, {
        category: ErrorCategory.FILE_SYSTEM,
        severity: 'medium',
        context: { component: 'BaileysManager', action: 'ensure_auth_dir' }
      });
    }
  }

  /**
   * Initialize connection with existing session or create new one
   */
  async initialize(sessionId?: string): Promise<ConnectionStatus> {
    try {
      this.sessionId = sessionId || null;
      
      // If sessionId provided, try to restore session
      if (this.sessionId) {
        const session = await SessionService.getById(this.sessionId);
        if (session && session.authBlob) {
          await this.connectWithSession(session);
          return this.connectionStatus;
        }
      }

      // Create new connection
      await this.createNewConnection();
      return this.connectionStatus;
    } catch (error) {
      console.error('Failed to initialize Baileys:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.connectionStatus = { status: 'error', error: errorMessage };
      return this.connectionStatus;
    }
  }

  /**
   * Create a new WhatsApp connection
   */
  private async createNewConnection(): Promise<void> {
    try {
      this.connectionStatus = { status: 'connecting' };
      this.emit('status_update', this.connectionStatus);

      const sessionDir = path.join(this.authDir, 'temp_session');
      const authState = await useMultiFileAuthState(sessionDir);
      const { state, saveCreds } = authState;

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['WhatsApp Status Handler', 'Chrome', '1.0.0'],
        connectTimeoutMs: 30000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        options: {
          // WebSocket configuration to prevent buffer utility errors
          perMessageDeflate: false,
          skipUTF8Validation: false,
          maxPayload: 100 * 1024 * 1024, // 100MB
        },
        // Additional socket configuration
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        fireInitQueries: true,
        emitOwnEvents: true,
        getMessage: async (key) => {
          // Return undefined to indicate message not found in cache
          return undefined;
        },
      });

      this.setupEventHandlers(saveCreds);
    } catch (error) {
      console.error('Failed to create new connection:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.connectionStatus = { status: 'error', error: errorMessage };
      this.emit('status_update', this.connectionStatus);
    }
  }

  /**
   * Connect with existing session
   */
  private async connectWithSession(session: { id: string; authBlob: string | null }): Promise<void> {
    try {
      this.connectionStatus = { status: 'connecting' };
      this.emit('status_update', this.connectionStatus);

      // Restore auth state from database
      const sessionDir = path.join(this.authDir, session.id);
      await this.restoreAuthState(sessionDir, session.authBlob);

      const authState = await useMultiFileAuthState(sessionDir);
      const { state, saveCreds } = authState;

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['WhatsApp Status Handler', 'Chrome', '1.0.0'],
        connectTimeoutMs: 30000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: true,
        options: {
          // WebSocket configuration to prevent buffer utility errors
          perMessageDeflate: false,
          skipUTF8Validation: false,
          maxPayload: 100 * 1024 * 1024, // 100MB
        },
        // Additional socket configuration
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        fireInitQueries: true,
        emitOwnEvents: true,
        getMessage: async (key) => {
          // Return undefined to indicate message not found in cache
          return undefined;
        },
      });

      this.setupEventHandlers(saveCreds, session.id);
    } catch (error) {
      console.error('Failed to connect with session:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.connectionStatus = { status: 'error', error: errorMessage };
      this.emit('status_update', this.connectionStatus);
    }
  }

  /**
   * Setup event handlers for the socket
   */
  private setupEventHandlers(saveCreds: () => Promise<void>, existingSessionId?: string) {
    if (!this.socket) return;

    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrCodeDataURL = await QRCode.toDataURL(qr);
          this.connectionStatus = { 
            status: 'qr_required', 
            qrCode: qrCodeDataURL 
          };
          this.emit('qr_code', qrCodeDataURL);
          this.emit('status_update', this.connectionStatus);
        } catch (error) {
          console.error('Failed to generate QR code:', error);
        }
      }

      if (connection === 'close') {
        console.log('Connection closed due to:', lastDisconnect?.error);
        this.connectionStabilizer.onConnectionClose(lastDisconnect);
        this.connectionStatus = { status: 'disconnected' };
        this.emit('status_update', this.connectionStatus);
      } else if (connection === 'open') {
        console.log('WhatsApp connection opened');
        this.connectionStabilizer.onConnectionOpen();
        this.connectionStatus = { status: 'connected', session: this.socket?.user };
        this.emit('status_update', this.connectionStatus);
        this.sessionRecoveryAttempts = 0;

        // Save or update session in database
        await this.saveSessionToDatabase(existingSessionId);
        
        // Update last seen
        if (this.sessionId) {
          try {
            await SessionService.updateLastSeen(this.sessionId);
          } catch (error) {
            errorHandler.handleError(error, {
              category: ErrorCategory.DATABASE,
              severity: 'medium',
              context: { component: 'BaileysManager', action: 'update_last_seen', sessionId: this.sessionId }
            });
          }
        }
      }
    });

    this.socket.ev.on('creds.update', saveCreds);

    // Handle messages for future features
    this.socket.ev.on('messages.upsert', (m) => {
      this.emit('messages', m);
    });

    // Handle message updates (delivery, read status, etc.)
    this.socket.ev.on('message.update', (update) => {
      this.emit('message_update', update);
    });

    // Handle contacts update
    this.socket.ev.on('contacts.update', (contacts) => {
      this.emit('contacts_update', contacts);
    });

    // Handle groups update
    this.socket.ev.on('groups.update', (groups) => {
      this.emit('groups_update', groups);
    });
  }

  /**
   * Save session credentials to database
   */
  private async saveSessionToDatabase(existingSessionId?: string) {
    try {
      if (!this.socket?.user) return;

      const user = this.socket.user;
      const deviceName = `${user.name || 'Unknown'} (${user.id})`;

      if (existingSessionId) {
        // Update existing session
        await SessionService.update(existingSessionId, {
          deviceName,
          lastSeenAt: new Date(),
          isActive: true,
        });
        this.sessionId = existingSessionId;
      } else {
        // Create new session
        const session = await SessionService.create({
          deviceName,
          authBlob: JSON.stringify(this.socket.user), // Store user info
        });
        this.sessionId = session.id;
      }

      console.log('Session saved to database:', this.sessionId);
    } catch (error) {
      console.error('Failed to save session to database:', error);
    }
  }

  /**
   * Restore auth state from database blob
   */
  private async restoreAuthState(sessionDir: string, authBlob: string) {
    try {
      await fs.mkdir(sessionDir, { recursive: true });
      // In a real implementation, you would restore the actual auth files
      // This is a simplified version
      console.log('Auth state restored for session');
    } catch (error) {
      console.error('Failed to restore auth state:', error);
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Get current QR code if available
   */
  getCurrentQRCode(): string | null {
    return this.connectionStatus.qrCode || null;
  }

  /**
   * Get current socket instance
   */
  getSocket(): WASocket | null {
    return this.socket;
  }

  /**
   * Check if socket is connected and ready
   */
  isSocketReady(): boolean {
    return !!(this.socket && this.socket.ws && this.socket.ws.readyState === 1);
  }

  /**
   * Safe socket state check
   */
  getSocketState(): 'connecting' | 'open' | 'closing' | 'closed' | 'not_initialized' {
    if (!this.socket || !this.socket.ws) {
      return 'not_initialized';
    }
    
    const readyState = this.socket.ws.readyState;
    switch (readyState) {
      case 0: return 'connecting'; // WebSocket.CONNECTING
      case 1: return 'open';       // WebSocket.OPEN
      case 2: return 'closing';    // WebSocket.CLOSING
      case 3: return 'closed';     // WebSocket.CLOSED
      default: return 'not_initialized';
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect() {
    try {
      // Reset connection stabilizer
      this.connectionStabilizer.reset();

      if (this.socket) {
        try {
          // Check if socket is still open before attempting to close
          if (this.socket.ws && this.socket.ws.readyState === 1) { // WebSocket.OPEN = 1
            this.socket.end(undefined);
          } else {
            console.log('WebSocket already closed, skipping end() call');
          }
        } catch (socketError) {
          // Log the error but don't throw - socket might already be closed
          console.warn('Error closing socket:', socketError instanceof Error ? socketError.message : socketError);
        } finally {
          this.socket = null;
        }
      }

      if (this.sessionId) {
        try {
          await SessionService.update(this.sessionId, {
            isActive: false,
            lastSeenAt: new Date(),
          });
        } catch (error) {
          errorHandler.handleError(error, {
            category: ErrorCategory.DATABASE,
            severity: 'medium',
            context: { component: 'BaileysManager', action: 'disconnect_update_session' }
          });
        }
      }

      this.connectionStatus = { status: 'disconnected' };
      this.emit('status_update', this.connectionStatus);
      
      console.log('WhatsApp connection disconnected');
    } catch (error) {
      errorHandler.handleError(error, {
        category: ErrorCategory.WHATSAPP,
        severity: 'medium',
        context: { component: 'BaileysManager', action: 'disconnect' }
      });
    }
  }

  /**
   * Get MessageSender instance for advanced sending capabilities
   */
  getMessageSender() {
    if (!this.socket || this.connectionStatus.status !== 'connected') {
      throw new Error('WhatsApp not connected');
    }
    
    const { MessageSender } = require('./MessageSender');
    return new MessageSender(this.socket);
  }

  /**
   * Send media to WhatsApp Status (legacy method - use MessageSender for more features)
   */
  async sendMediaToStatus(mediaBuffer: Buffer, mimetype: string, caption?: string) {
    if (!this.socket || this.connectionStatus.status !== 'connected') {
      throw new Error('WhatsApp not connected');
    }

    try {
      const result = await this.socket.sendMessage('status@broadcast', {
        [mimetype.startsWith('image/') ? 'image' : 'video']: mediaBuffer,
        caption,
        mimetype,
      });

      return result;
    } catch (error) {
      console.error('Failed to send media to status:', error);
      throw error;
    }
  }

  /**
   * Get user contacts
   */
  async getContacts() {
    if (!this.socket || this.connectionStatus.status !== 'connected') {
      throw new Error('WhatsApp not connected');
    }

    try {
      // Note: Baileys doesn't directly provide contacts API
      // This would need to be implemented based on message history or other methods
      return [];
    } catch (error) {
      console.error('Failed to get contacts:', error);
      throw error;
    }
  }

  /**
   * Get user groups
   */
  async getGroups() {
    if (!this.socket || this.connectionStatus.status !== 'connected') {
      throw new Error('WhatsApp not connected');
    }

    try {
      const groups = await this.socket.groupFetchAllParticipating();
      return Object.values(groups);
    } catch (error) {
      console.error('Failed to get groups:', error);
      throw error;
    }
  }

  /**
   * Get connection health information
   */
  getConnectionHealth() {
    return this.connectionStabilizer.getConnectionHealth();
  }

  /**
   * Get connection metrics
   */
  getConnectionMetrics() {
    return this.connectionStabilizer.getMetrics();
  }

  /**
   * Update reconnection strategy
   */
  updateReconnectionStrategy(strategy: Partial<{
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    jitter: boolean;
  }>) {
    this.connectionStabilizer.updateStrategy(strategy);
  }

  /**
   * Check if an action is rate limited
   */
  isRateLimited(action: string, maxPerMinute?: number): boolean {
    return this.connectionStabilizer.isRateLimited(action, maxPerMinute);
  }

  /**
   * Record an action for rate limiting
   */
  recordAction(action: string): void {
    this.connectionStabilizer.recordAction(action);
  }

  /**
   * Attempt session recovery
   */
  async attemptSessionRecovery(): Promise<boolean> {
    if (this.sessionRecoveryAttempts >= this.maxSessionRecoveryAttempts) {
      console.warn('Max session recovery attempts reached');
      return false;
    }

    this.sessionRecoveryAttempts++;
    console.log(`Attempting session recovery (${this.sessionRecoveryAttempts}/${this.maxSessionRecoveryAttempts})`);

    try {
      // Try to restore from a backup session if available
      if (this.sessionId) {
        const session = await SessionService.getById(this.sessionId);
        if (session?.authBlob) {
          await this.connectWithSession(session);
          return true;
        }
      }

      // If no session available, create new connection
      await this.createNewConnection();
      return true;
    } catch (error) {
      errorHandler.handleError(error, {
        category: ErrorCategory.WHATSAPP,
        severity: 'high',
        context: { 
          component: 'BaileysManager', 
          action: 'session_recovery',
          attempt: this.sessionRecoveryAttempts
        }
      });
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.connectionStabilizer.destroy();
    this.removeAllListeners();
  }
}

// Singleton instance
let baileysManager: BaileysManager | null = null;

export function getBaileysManager(): BaileysManager {
  if (!baileysManager) {
    baileysManager = new BaileysManager();
  }
  return baileysManager;
}
