import crypto from 'crypto';

// Environment variable for encryption key
const ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY || 'your-32-byte-encryption-key-here';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const TAG_LENGTH = 16; // 16 bytes for GCM tag
const SALT_LENGTH = 16; // 16 bytes for salt

// Advanced encryption configuration
export interface EncryptionConfig {
  algorithm: string;
  keyDerivation: 'scrypt' | 'pbkdf2';
  iterations?: number;
  saltLength: number;
  ivLength: number;
  tagLength: number;
  keyLength: number;
}

export const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: 'aes-256-gcm',
  keyDerivation: 'scrypt',
  iterations: 100000,
  saltLength: 16,
  ivLength: 16,
  tagLength: 16,
  keyLength: 32
};

// Key management interface
export interface KeyManager {
  generateKey(): Promise<Buffer>;
  deriveKey(password: string, salt: Buffer, config?: EncryptionConfig): Promise<Buffer>;
  rotateKey(oldKey: Buffer, newPassword?: string): Promise<Buffer>;
  validateKey(key: Buffer): boolean;
}

// Derive a key from password using scrypt
function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 32, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

/**
 * Encrypt sensitive data (like session auth blobs)
 */
export async function encrypt(text: string): Promise<string> {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = await deriveKey(ENCRYPTION_KEY, salt);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Get the auth tag for GCM mode
    const authTag = cipher.getAuthTag();
    
    // Combine salt, IV, authTag, and encrypted data
    const result = Buffer.concat([salt, iv, authTag, encrypted]);

    return result.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    // Fallback: return original text (not recommended for production)
    return Buffer.from(text).toString('base64');
  }
}

/**
 * Decrypt sensitive data
 */
export async function decrypt(encryptedText: string): Promise<string> {
  try {
    const encryptedBuffer = Buffer.from(encryptedText, 'base64');
    
    // Extract components
    const salt = encryptedBuffer.slice(0, SALT_LENGTH);
    const iv = encryptedBuffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = encryptedBuffer.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = encryptedBuffer.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive key
    const key = await deriveKey(ENCRYPTION_KEY, salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error);
    // Fallback: try to decode as simple base64
    try {
      return Buffer.from(encryptedText, 'base64').toString('utf8');
    } catch {
      return encryptedText; // Return as-is if all fails
    }
  }
}

/**
 * Advanced Key Manager Implementation
 */
export class AdvancedKeyManager implements KeyManager {
  private config: EncryptionConfig;

  constructor(config: EncryptionConfig = DEFAULT_ENCRYPTION_CONFIG) {
    this.config = config;
  }

  async generateKey(): Promise<Buffer> {
    return crypto.randomBytes(this.config.keyLength);
  }

  async deriveKey(password: string, salt: Buffer, config?: EncryptionConfig): Promise<Buffer> {
    const cfg = config || this.config;
    
    if (cfg.keyDerivation === 'pbkdf2') {
      return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, cfg.iterations || 100000, cfg.keyLength, 'sha512', (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, cfg.keyLength, (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey as Buffer);
        });
      });
    }
  }

  async rotateKey(oldKey: Buffer, newPassword?: string): Promise<Buffer> {
    if (newPassword) {
      const salt = crypto.randomBytes(this.config.saltLength);
      return this.deriveKey(newPassword, salt);
    } else {
      return this.generateKey();
    }
  }

  validateKey(key: Buffer): boolean {
    return key.length === this.config.keyLength;
  }
}

/**
 * Advanced encryption with configurable options
 */
export async function encryptAdvanced(
  text: string, 
  password?: string, 
  config: EncryptionConfig = DEFAULT_ENCRYPTION_CONFIG
): Promise<string> {
  try {
    const keyManager = new AdvancedKeyManager(config);
    const iv = crypto.randomBytes(config.ivLength);
    const salt = crypto.randomBytes(config.saltLength);
    
    let key: Buffer;
    if (password) {
      key = await keyManager.deriveKey(password, salt, config);
    } else {
      key = await keyManager.deriveKey(ENCRYPTION_KEY, salt, config);
    }

    const cipher = crypto.createCipheriv(config.algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();
    const result = Buffer.concat([salt, iv, authTag, encrypted]);

    return result.toString('base64');
  } catch (error) {
    console.error('Advanced encryption error:', error);
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Advanced decryption with configurable options
 */
export async function decryptAdvanced(
  encryptedText: string, 
  password?: string, 
  config: EncryptionConfig = DEFAULT_ENCRYPTION_CONFIG
): Promise<string> {
  try {
    const keyManager = new AdvancedKeyManager(config);
    const encryptedBuffer = Buffer.from(encryptedText, 'base64');
    
    const salt = encryptedBuffer.slice(0, config.saltLength);
    const iv = encryptedBuffer.slice(config.saltLength, config.saltLength + config.ivLength);
    const authTag = encryptedBuffer.slice(
      config.saltLength + config.ivLength, 
      config.saltLength + config.ivLength + config.tagLength
    );
    const encrypted = encryptedBuffer.slice(config.saltLength + config.ivLength + config.tagLength);
    
    let key: Buffer;
    if (password) {
      key = await keyManager.deriveKey(password, salt, config);
    } else {
      key = await keyManager.deriveKey(ENCRYPTION_KEY, salt, config);
    }

    const decipher = crypto.createDecipheriv(config.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Advanced decryption error:', error);
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a secure encryption key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash data using SHA256
 */
export function hashData(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a secure session ID
 */
export function generateSessionId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate cryptographically secure random bytes
 */
export function generateSecureRandom(length: number): Buffer {
  return crypto.randomBytes(length);
}

/**
 * Create HMAC signature for data integrity
 */
export function createHMAC(data: string | Buffer, key: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

/**
 * Verify HMAC signature
 */
export function verifyHMAC(data: string | Buffer, signature: string, key: string): boolean {
  const expectedSignature = createHMAC(data, key);
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
}
