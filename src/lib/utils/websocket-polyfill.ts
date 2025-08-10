/**
 * WebSocket Buffer Utility Polyfill
 * 
 * This module provides polyfills for WebSocket buffer utilities that are
 * required by the ws library but may not be available in certain Node.js
 * environments or when running in Next.js API routes.
 */

// Ensure buffer utilities are available
let bufferUtil: any;
let utf8Validate: any;

try {
  bufferUtil = require('bufferutil');
} catch (error) {
  // Fallback implementation for bufferUtil.mask
  bufferUtil = {
    mask: (source: Buffer, mask: Buffer, output: Buffer, offset: number, length: number) => {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    },
    unmask: (buffer: Buffer, mask: Buffer) => {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    },
  };
}

try {
  utf8Validate = require('utf-8-validate');
} catch (error) {
  // Fallback implementation for utf8Validate
  utf8Validate = (buffer: Buffer) => {
    try {
      buffer.toString('utf8');
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * Initialize WebSocket polyfills
 * This should be called before initializing any WebSocket connections
 */
export function initializeWebSocketPolyfills(): void {
  // Ensure global availability of buffer utilities
  if (typeof global !== 'undefined') {
    // @ts-ignore
    global.bufferUtil = bufferUtil;
    // @ts-ignore
    global.utf8Validate = utf8Validate;
  }

  // Also ensure they're available on the process object
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    // @ts-ignore
    process.bufferUtil = bufferUtil;
    // @ts-ignore
    process.utf8Validate = utf8Validate;
  }
}

/**
 * Get buffer utilities
 */
export function getBufferUtil() {
  return bufferUtil;
}

/**
 * Get UTF-8 validator
 */
export function getUtf8Validate() {
  return utf8Validate;
}

/**
 * Check if buffer utilities are properly initialized
 */
export function isWebSocketPolyfillReady(): boolean {
  return !!(bufferUtil && bufferUtil.mask && utf8Validate);
}

// Auto-initialize polyfills when this module is imported
initializeWebSocketPolyfills();
