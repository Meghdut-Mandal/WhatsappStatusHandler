import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState as getBaileysAuthState,
  WASocket,
  Browsers,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { SessionService } from '../db';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { ConnectionStabilizer } from './ConnectionStabilizer';
import { errorHandler, ErrorCategory, ErrorSeverity } from '../errors/ErrorHandler';
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
  // Prevent concurrent or duplicate inits/sockets
  private isInitializing = false;
  private initPromise: Promise<ConnectionStatus> | null = null;
  private lastInitAt = 0;

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
      if (this.sessionId) {
        this.initialize(this.sessionId);
      }
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
   * Recursively read a directory and return a map of relative file paths to base64 contents
   */
  private async packAuthState(sessionDir: string): Promise<string> {
    const entries: Record<string, string> = {};

    const walk = async (dir: string, base: string) => {
      const dirents = await fs.readdir(dir, { withFileTypes: true });
      for (const dirent of dirents) {
        const abs = path.join(dir, dirent.name);
        const rel = path.join(base, dirent.name);
        if (dirent.isDirectory()) {
          await walk(abs, rel);
        } else {
          const buf = await fs.readFile(abs);
          entries[rel] = buf.toString('base64');
        }
      }
    };

    try {
      await walk(sessionDir, '.');
    } catch (error) {
      console.warn('Packing auth state failed (might be first run):', error);
    }
    return JSON.stringify({ __format: 'baileys-multi-file@1', files: entries });
  }

  /**
   * Restore a packed auth blob JSON into sessionDir
   */
  private async restoreAuthStateFromBlob(sessionDir: string, packed: string) {
    type Packed = { __format?: string; files?: Record<string, string> };
    const parsed: unknown = JSON.parse(packed);
    let entries: Record<string, string> | undefined;
    if (
      typeof parsed === 'object' && parsed !== null &&
      '__format' in parsed && 'files' in parsed &&
      typeof (parsed as Packed).files === 'object' && (parsed as Packed).files !== null
    ) {
      entries = (parsed as Packed).files as Record<string, string>;
    } else {
      console.warn('Auth blob not in expected packed format; skipping restore. A new pairing may be required.');
      return;
    }
    await fs.mkdir(sessionDir, { recursive: true });
    const writes: Array<Promise<void>> = [];
    for (const [rel, b64] of Object.entries(entries)) {
      const abs = path.join(sessionDir, rel);
      const dir = path.dirname(abs);
      // ensure directory
      writes.push(
        (async () => {
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(abs, Buffer.from(b64, 'base64'));
        })()
      );
    }
    await Promise.all(writes);
  }

  /**
   * Backup current auth state files into DB for this session
   */
  private async backupAuthState(sessionDir: string) {
    try {
      if (!this.sessionId) return;
      const blob = await this.packAuthState(sessionDir);
      await SessionService.update(this.sessionId, { authBlob: blob, lastSeenAt: new Date(), isActive: true });
    } catch (error) {
      console.warn('Auth state backup failed:', error);
    }
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
        severity: ErrorSeverity.MEDIUM,
        context: { component: 'BaileysManager', action: 'ensure_auth_dir' }
      });
    }
  }

  /**
   * Initialize connection with existing session or create new one
   */
  async initialize(sessionId?: string): Promise<ConnectionStatus> {
    // Debounce/serialize initialize calls to avoid duplicate sockets
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    // If a socket already exists and is connecting/open, just return status
    const state = this.getSocketState();
    if (state === 'open' || state === 'connecting') {
      return this.connectionStatus;
    }

    this.isInitializing = true;
    this.initPromise = (async () => {
      try {
        this.sessionId = sessionId || null;
        this.lastInitAt = Date.now();

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
      } finally {
        this.isInitializing = false;
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Create a new WhatsApp connection
   */
  private async createNewConnection(): Promise<void> {
    try {
      this.connectionStatus = { status: 'connecting' };
      this.emit('status_update', this.connectionStatus);

      // Ensure any previous socket is fully torn down to avoid conflicts
      await this.teardownExistingSocket();

      const sessionDir = path.join(this.authDir, 'temp_session');
      const authState = await getBaileysAuthState(sessionDir);
      const { state, saveCreds } = authState;

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        // Use desktop browser for better message history and features
        browser: Browsers.macOS('WhatsApp Status Handler'),
        connectTimeoutMs: 30000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        // Enable full history sync for better connection
        syncFullHistory: true,
        options: {
          // WebSocket configuration to prevent buffer utility errors
          // perMessageDeflate: false, // Not supported in current Baileys version
          // skipUTF8Validation: false, // Not supported in current Baileys version
          maxPayload: 100 * 1024 * 1024, // 100MB
        },
        // Additional socket configuration
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        fireInitQueries: true,
        emitOwnEvents: true,
        getMessage: async (_key) => {
          // Return undefined to indicate message not found in cache
          return undefined;
        },
      });

      this.setupEventHandlers(saveCreds, undefined, sessionDir);
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

      // Ensure any previous socket is fully torn down to avoid conflicts
      await this.teardownExistingSocket();

      // Restore auth state from database
      const sessionDir = path.join(this.authDir, session.id);
      if (session.authBlob) {
        await this.restoreAuthStateFromBlob(sessionDir, session.authBlob);
      }

      const authState = await getBaileysAuthState(sessionDir);
      const { state, saveCreds } = authState;

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        // Use desktop browser for better message history and features
        browser: Browsers.macOS('WhatsApp Status Handler'),
        connectTimeoutMs: 30000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: true,
        // Enable full history sync for better connection
        syncFullHistory: true,
        options: {
          // WebSocket configuration to prevent buffer utility errors
          // perMessageDeflate: false, // Not supported in current Baileys version
          // skipUTF8Validation: false, // Not supported in current Baileys version
          maxPayload: 100 * 1024 * 1024, // 100MB
        },
        // Additional socket configuration
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        fireInitQueries: true,
        emitOwnEvents: true,
        getMessage: async (_key) => {
          // Return undefined to indicate message not found in cache
          return undefined;
        },
      });

      this.setupEventHandlers(saveCreds, session.id, sessionDir);
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
  private setupEventHandlers(saveCreds: () => Promise<void>, existingSessionId?: string, sessionDir?: string) {
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

        // Detect logged out and cleanup session
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          try {
            if (this.sessionId) {
              await SessionService.update(this.sessionId, { isActive: false, authBlob: undefined });
            }
            if (sessionDir) {
              // Best effort cleanup
              await fs.rm(sessionDir, { recursive: true, force: true });
            }
          } catch (e) {
            console.warn('Cleanup after loggedOut failed:', e);
          }
        }

        // If connection was replaced/conflict, don't auto-reconnect here; let user/API re-init
        if (statusCode === DisconnectReason.connectionReplaced) {
          console.warn('Connection replaced by another instance. Skipping auto-reconnect to avoid conflicts.');
        }

        this.connectionStatus = { status: 'disconnected' };
        this.emit('status_update', this.connectionStatus);
      } else if (connection === 'open') {
        console.log('WhatsApp connection opened');
        this.connectionStabilizer.onConnectionOpen();
        this.connectionStatus = { 
          status: 'connected', 
          session: this.socket?.user ? {
            ...this.socket.user,
            id: this.socket.user.id,
            name: this.socket.user.name,
          } : undefined
        };
        this.emit('status_update', this.connectionStatus);
        this.sessionRecoveryAttempts = 0;

        // Save or update session in database along with auth state
        await this.saveSessionToDatabase(existingSessionId, sessionDir);
        
        // Update last seen
        if (this.sessionId) {
          try {
            await SessionService.updateLastSeen(this.sessionId);
          } catch (error) {
            errorHandler.handleError(error, {
              category: ErrorCategory.DATABASE,
              severity: ErrorSeverity.MEDIUM,
              context: { component: 'BaileysManager', action: 'update_last_seen', sessionId: this.sessionId }
            });
          }
        }

        // Send "Connected to Bot" message to the connected number
        await this.sendConnectionConfirmationMessage();
      }
    });

    this.socket.ev.on('creds.update', async () => {
      await saveCreds();
      // Also persist the latest auth state into DB backup
      if (sessionDir && (this.sessionId || existingSessionId)) {
        await this.backupAuthState(sessionDir);
      }
    });

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
   * Tear down any existing socket cleanly to prevent duplicate connections & listeners
   */
  private async teardownExistingSocket(): Promise<void> {
    if (!this.socket) return;
    try {
      // Remove all listeners attached to the old socket
      try {
        this.socket.ev.removeAllListeners();
      } catch {}
      // End the websocket if still open
      if (this.socket.ws && this.socket.ws.readyState === 1) {
        this.socket.end(undefined);
      }
    } catch (err) {
      console.warn('Error tearing down existing socket:', err instanceof Error ? err.message : err);
    } finally {
      this.socket = null;
    }
  }

  /**
   * Save session credentials to database
   */
  private async saveSessionToDatabase(existingSessionId?: string, sessionDir?: string) {
    try {
      if (!this.socket?.user) return;

      const user = this.socket.user;
      const deviceName = `${user.name || 'Unknown'} (${user.id})`;
      const authBlob = sessionDir ? await this.packAuthState(sessionDir) : undefined;

      if (existingSessionId) {
        // Update existing session
        await SessionService.update(existingSessionId, {
          deviceName,
          lastSeenAt: new Date(),
          isActive: true,
          authBlob,
        });
        this.sessionId = existingSessionId;
      } else {
        // Create new session
        const session = await SessionService.create({
          deviceName,
          authBlob,
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
    // Deprecated: kept for backward compatibility if referenced elsewhere
    return this.restoreAuthStateFromBlob(sessionDir, authBlob);
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
            severity: ErrorSeverity.MEDIUM,
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
        severity: ErrorSeverity.MEDIUM,
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
    
    // Defer import to avoid circular deps and align with ESM
    // kept for backward compatibility; dynamic import suggested in error below
    // Return a proxy-like object to preserve existing callsites expecting instance
    // but encourage updating callsites to await this function instead if needed.
    // For now, we throw if someone tries to use without awaiting.
    // To avoid breaking API, return a minimal wrapper with same methods bound after dynamic import.
    // Simpler: throw clear instruction.
    throw new Error('getMessageSender now uses dynamic import. Call: (await import("@/lib/socketManager/MessageSender")).MessageSender and pass the socket from getSocket().');
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
   * Send connection confirmation message to the connected WhatsApp number
   */
  private async sendConnectionConfirmationMessage(): Promise<void> {
    if (!this.socket || this.connectionStatus.status !== 'connected') {
      console.warn('Cannot send connection message: WhatsApp not connected');
      return;
    }

    try {
      // Get the connected user's number
      const userJid = this.socket.user?.id;
      if (!userJid) {
        console.warn('Cannot send connection message: User JID not available');
        return;
      }

      // Send a text message to the user confirming the connection
      const confirmationMessage = {
        text: '🤖 *Connected to Bot*\n\nYour WhatsApp Status Handler is now connected and ready to use!\n\n✅ You can now send media to your status\n✅ Upload files through the web interface\n✅ Manage your WhatsApp content easily\n\nEnjoy using the WhatsApp Status Handler! 🚀'
      };

      const result = await this.socket.sendMessage(userJid, confirmationMessage);
      console.log('Connection confirmation message sent successfully:', result?.key?.id);
      
      // Emit event for logging/tracking purposes
      this.emit('connection_message_sent', {
        messageId: result?.key?.id,
        timestamp: new Date().toISOString(),
        userJid
      });

    } catch (error) {
      console.error('Failed to send connection confirmation message:', error);
      // Don't throw error here to avoid disrupting the connection process
      errorHandler.handleError(error, {
        category: ErrorCategory.WHATSAPP,
        severity: ErrorSeverity.LOW,
        context: { 
          component: 'BaileysManager', 
          action: 'send_connection_confirmation',
          sessionId: this.sessionId || undefined
        }
      });
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
        severity: ErrorSeverity.HIGH,
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

// Robust singleton across Next.js hot-reloads using globalThis
declare global {
  // eslint-disable-next-line no-var
  var __BAILEYS_MANAGER__: BaileysManager | undefined;
}

export function getBaileysManager(): BaileysManager {
  if (!globalThis.__BAILEYS_MANAGER__) {
    globalThis.__BAILEYS_MANAGER__ = new BaileysManager();
  }
  return globalThis.__BAILEYS_MANAGER__;
}
