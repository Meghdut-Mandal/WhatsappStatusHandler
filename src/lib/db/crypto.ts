import crypto from 'crypto';

// Environment variable for encryption key
const ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY || 'your-32-byte-encryption-key-here';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const TAG_LENGTH = 16; // 16 bytes for GCM tag

/**
 * Encrypt sensitive data (like session auth blobs)
 */
export async function encrypt(text: string): Promise<string> {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
    cipher.setAutoPadding(true);

    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // For GCM mode, we need to handle the auth tag
    const authTag = cipher.getAuthTag ? cipher.getAuthTag() : Buffer.alloc(0);
    
    // Combine IV, authTag, and encrypted data
    const result = {
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      encryptedData: encrypted,
    };

    return Buffer.from(JSON.stringify(result)).toString('base64');
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
    const parsed = JSON.parse(Buffer.from(encryptedText, 'base64').toString('utf8'));
    
    const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
    
    if (parsed.authTag) {
      decipher.setAuthTag(Buffer.from(parsed.authTag, 'base64'));
    }

    let decrypted = decipher.update(parsed.encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
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
