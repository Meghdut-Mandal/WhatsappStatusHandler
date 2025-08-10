/**
 * WebSocket Fix Test Utility
 * 
 * This utility can be used to verify that the WebSocket buffer utility fix is working properly.
 */

import { initializeWebSocketPolyfills, isWebSocketPolyfillReady, getBufferUtil } from './websocket-polyfill';

/**
 * Test the WebSocket buffer utility fix
 */
export function testWebSocketFix(): {
  success: boolean;
  message: string;
  details: {
    polyfillsReady: boolean;
    bufferUtilAvailable: boolean;
    maskFunctionExists: boolean;
    nativeBufferUtilAvailable: boolean;
  };
} {
  const details = {
    polyfillsReady: false,
    bufferUtilAvailable: false,
    maskFunctionExists: false,
    nativeBufferUtilAvailable: false,
  };

  try {
    // Initialize polyfills
    initializeWebSocketPolyfills();
    details.polyfillsReady = isWebSocketPolyfillReady();

    // Check buffer util availability
    const bufferUtil = getBufferUtil();
    details.bufferUtilAvailable = !!bufferUtil;
    details.maskFunctionExists = !!(bufferUtil && typeof bufferUtil.mask === 'function');

    // Check if native buffer util is available
    try {
      const nativeBufferUtil = require('bufferutil');
      details.nativeBufferUtilAvailable = !!nativeBufferUtil;
    } catch {
      details.nativeBufferUtilAvailable = false;
    }

    // Test the mask function with dummy data
    if (details.maskFunctionExists) {
      try {
        const source = Buffer.from([1, 2, 3, 4]);
        const mask = Buffer.from([0xFF, 0x00, 0xFF, 0x00]);
        const output = Buffer.alloc(4);
        
        bufferUtil.mask(source, mask, output, 0, 4);
        
        // Verify the masking worked
        const expected = Buffer.from([0xFE, 0x02, 0xFC, 0x04]);
        const maskWorked = output.equals(expected);
        
        if (maskWorked) {
          return {
            success: true,
            message: 'WebSocket buffer utility fix is working correctly',
            details,
          };
        } else {
          return {
            success: false,
            message: 'Buffer masking function exists but produces incorrect results',
            details,
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Buffer masking test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details,
        };
      }
    } else {
      return {
        success: false,
        message: 'Buffer masking function is not available',
        details,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `WebSocket fix test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details,
    };
  }
}

/**
 * Log test results to console
 */
export function logWebSocketFixTest(): void {
  const result = testWebSocketFix();
  
  console.log('=== WebSocket Fix Test Results ===');
  console.log(`Status: ${result.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Message: ${result.message}`);
  console.log('Details:');
  console.log(`  - Polyfills Ready: ${result.details.polyfillsReady ? '✅' : '❌'}`);
  console.log(`  - Buffer Util Available: ${result.details.bufferUtilAvailable ? '✅' : '❌'}`);
  console.log(`  - Mask Function Exists: ${result.details.maskFunctionExists ? '✅' : '❌'}`);
  console.log(`  - Native Buffer Util Available: ${result.details.nativeBufferUtilAvailable ? '✅' : '❌'}`);
  console.log('=====================================');
}
