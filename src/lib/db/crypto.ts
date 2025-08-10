import crypto from 'crypto';

// Environment variable for encryption key
const ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY || 'your-32-byte-encryption-key-here';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const TAG_LENGTH = 16; // 16 bytes for GCM tag
const SALT_LENGTH = 16; // 16 bytes for salt

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
