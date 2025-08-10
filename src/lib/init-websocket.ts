/**
 * WebSocket Initialization Module
 * 
 * This module should be imported early in the application lifecycle
 * to ensure proper WebSocket buffer utilities are available.
 */

// Import and initialize WebSocket polyfills
import { initializeWebSocketPolyfills, isWebSocketPolyfillReady } from './utils/websocket-polyfill';

// Ensure polyfills are initialized immediately
initializeWebSocketPolyfills();

// Verify initialization
if (!isWebSocketPolyfillReady()) {
  console.error('WebSocket polyfills failed to initialize properly');
} else {
  console.log('WebSocket polyfills initialized successfully');
}

// Export a function to verify WebSocket readiness
export function ensureWebSocketReady(): boolean {
  if (!isWebSocketPolyfillReady()) {
    console.warn('Re-initializing WebSocket polyfills...');
    initializeWebSocketPolyfills();
  }
  return isWebSocketPolyfillReady();
}

// Ensure buffer utilities are available globally for ws library
if (typeof global !== 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bufferUtil = require('bufferutil');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const utf8Validate = require('utf-8-validate');
    
    // @ts-expect-error - Adding to global for ws library compatibility
    global.bufferUtil = bufferUtil;
    // @ts-expect-error - Adding to global for ws library compatibility
    global.utf8Validate = utf8Validate;
    
    console.log('Native buffer utilities loaded successfully');
  } catch (error) {
    console.warn('Native buffer utilities not available, using polyfills');
  }
}
