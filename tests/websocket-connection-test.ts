/**
 * WebSocket Connection Test Suite
 * 
 * This test file helps debug and test WebSocket connection issues
 * in the WhatsApp Status Handler application.
 */

import { getBaileysManager } from '../src/lib/socketManager';
import { errorHandler } from '../src/lib/errors/ErrorHandler';

interface TestResult {
  testName: string;
  success: boolean;
  error?: string;
  duration?: number;
  details?: any;
}

class WebSocketConnectionTester {
  private results: TestResult[] = [];
  private baileysManager = getBaileysManager();

  async runAllTests(): Promise<TestResult[]> {
    console.log('🧪 Starting WebSocket Connection Tests...\n');

    await this.testPolyfillInitialization();
    await this.testManagerInitialization();
    await this.testConnectionCreation();
    await this.testSocketStateChecks();
    await this.testDisconnectionSafety();
    await this.testReconnectionFlow();
    await this.testErrorHandling();
    await this.testConcurrentConnections();

    this.printResults();
    return this.results;
  }

  private async runTest(testName: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    console.log(`🔬 Running: ${testName}`);

    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({
        testName,
        success: true,
        duration
      });
      console.log(`✅ ${testName} - PASSED (${duration}ms)\n`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.results.push({
        testName,
        success: false,
        error: errorMessage,
        duration
      });
      console.log(`❌ ${testName} - FAILED (${duration}ms)`);
      console.log(`   Error: ${errorMessage}\n`);
    }
  }

  private async testPolyfillInitialization(): Promise<void> {
    await this.runTest('WebSocket Polyfill Initialization', async () => {
      const { isWebSocketPolyfillReady } = await import('../src/lib/utils/websocket-polyfill');
      
      if (!isWebSocketPolyfillReady()) {
        throw new Error('WebSocket polyfills are not properly initialized');
      }

      // Check global availability
      if (typeof global !== 'undefined') {
        // @ts-ignore
        if (!global.bufferUtil || !global.utf8Validate) {
          throw new Error('Global WebSocket utilities not available');
        }
      }

      console.log('   ✓ WebSocket polyfills are properly initialized');
    });
  }

  private async testManagerInitialization(): Promise<void> {
    await this.runTest('BaileysManager Initialization', async () => {
      const manager = getBaileysManager();
      
      if (!manager) {
        throw new Error('BaileysManager failed to initialize');
      }

      const status = manager.getConnectionStatus();
      if (!status) {
        throw new Error('Connection status not available');
      }

      console.log(`   ✓ Manager initialized with status: ${status.status}`);
    });
  }

  private async testConnectionCreation(): Promise<void> {
    await this.runTest('Connection Creation', async () => {
      const manager = getBaileysManager();
      
      // Test initial connection
      const status = await manager.initialize();
      
      if (!status) {
        throw new Error('Failed to get connection status');
      }

      console.log(`   ✓ Connection created with status: ${status.status}`);
      
      // Wait a moment to let connection settle
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const finalStatus = manager.getConnectionStatus();
      console.log(`   ✓ Final status: ${finalStatus.status}`);
    });
  }

  private async testSocketStateChecks(): Promise<void> {
    await this.runTest('Socket State Checks', async () => {
      const manager = getBaileysManager();
      
      // Test socket state getter
      const socketState = manager.getSocketState();
      console.log(`   ✓ Socket state: ${socketState}`);
      
      // Test socket ready check
      const isReady = manager.isSocketReady();
      console.log(`   ✓ Socket ready: ${isReady}`);
      
      // Test socket instance getter
      const socket = manager.getSocket();
      console.log(`   ✓ Socket instance: ${socket ? 'Available' : 'Not available'}`);
      
      if (socket && socket.ws) {
        console.log(`   ✓ WebSocket readyState: ${socket.ws.readyState}`);
      }
    });
  }

  private async testDisconnectionSafety(): Promise<void> {
    await this.runTest('Safe Disconnection', async () => {
      const manager = getBaileysManager();
      
      // Get initial state
      const initialState = manager.getSocketState();
      console.log(`   ✓ Initial state: ${initialState}`);
      
      // Test disconnect - this should not throw an error
      await manager.disconnect();
      console.log('   ✓ Disconnect completed without errors');
      
      // Check final state
      const finalState = manager.getSocketState();
      console.log(`   ✓ Final state: ${finalState}`);
      
      // Verify connection status
      const status = manager.getConnectionStatus();
      if (status.status !== 'disconnected') {
        throw new Error(`Expected disconnected status, got: ${status.status}`);
      }
      console.log('   ✓ Connection status correctly set to disconnected');
    });
  }

  private async testReconnectionFlow(): Promise<void> {
    await this.runTest('Reconnection Flow', async () => {
      const manager = getBaileysManager();
      
      // Ensure we start disconnected
      await manager.disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Test reconnection
      console.log('   ⏳ Attempting reconnection...');
      const status = await manager.initialize();
      
      console.log(`   ✓ Reconnection attempt completed with status: ${status.status}`);
      
      // Allow time for connection to stabilize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const finalStatus = manager.getConnectionStatus();
      console.log(`   ✓ Final reconnection status: ${finalStatus.status}`);
    });
  }

  private async testErrorHandling(): Promise<void> {
    await this.runTest('Error Handling', async () => {
      // Test error handler is working
      const stats = errorHandler.getErrorStats();
      console.log(`   ✓ Error handler available - Total errors: ${stats.total}`);
      
      // Test error creation
      const testError = new Error('Test error for WebSocket debugging');
      errorHandler.createWhatsAppError(testError, {
        component: 'WebSocketTester',
        action: 'test_error_handling'
      });
      
      const newStats = errorHandler.getErrorStats();
      if (newStats.total <= stats.total) {
        throw new Error('Error handler did not record the test error');
      }
      
      console.log('   ✓ Error handling is working correctly');
    });
  }

  private async testConcurrentConnections(): Promise<void> {
    await this.runTest('Concurrent Connection Handling', async () => {
      const manager = getBaileysManager();
      
      // Ensure clean state
      await manager.disconnect();
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Test multiple rapid connection attempts
      console.log('   ⏳ Testing concurrent connection attempts...');
      
      const promises = [
        manager.initialize(),
        manager.initialize(),
        manager.initialize()
      ];
      
      const results = await Promise.allSettled(promises);
      
      let successCount = 0;
      let errorCount = 0;
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
          console.log(`   ✓ Connection attempt ${index + 1}: ${result.value.status}`);
        } else {
          errorCount++;
          console.log(`   ❌ Connection attempt ${index + 1} failed: ${result.reason}`);
        }
      });
      
      console.log(`   ✓ Concurrent test completed - Success: ${successCount}, Errors: ${errorCount}`);
      
      // Verify final state
      const finalState = manager.getConnectionStatus();
      console.log(`   ✓ Final state after concurrent attempts: ${finalState.status}`);
    });
  }

  private printResults(): void {
    console.log('\n📊 Test Results Summary');
    console.log('========================\n');

    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => r.success === false).length;
    const totalTime = this.results.reduce((sum, r) => sum + (r.duration || 0), 0);

    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total Time: ${totalTime}ms\n`);

    if (failed > 0) {
      console.log('❌ Failed Tests:');
      this.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`   • ${r.testName}: ${r.error}`);
        });
      console.log('');
    }

    if (passed === this.results.length) {
      console.log('🎉 All tests passed! WebSocket connections are working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Please review the errors above.');
    }
  }

  // Helper method to run individual tests
  async testSpecific(testName: string): Promise<TestResult | null> {
    const testMethods: Record<string, () => Promise<void>> = {
      'polyfill': () => this.testPolyfillInitialization(),
      'manager': () => this.testManagerInitialization(),
      'connection': () => this.testConnectionCreation(),
      'state': () => this.testSocketStateChecks(),
      'disconnect': () => this.testDisconnectionSafety(),
      'reconnect': () => this.testReconnectionFlow(),
      'errors': () => this.testErrorHandling(),
      'concurrent': () => this.testConcurrentConnections(),
    };

    const method = testMethods[testName.toLowerCase()];
    if (!method) {
      console.log(`❌ Test '${testName}' not found. Available tests: ${Object.keys(testMethods).join(', ')}`);
      return null;
    }

    this.results = []; // Reset results for individual test
    await method();
    return this.results[0] || null;
  }
}

// Export for use in other files
export { WebSocketConnectionTester };

// CLI interface for running tests directly
if (require.main === module) {
  const tester = new WebSocketConnectionTester();
  
  const args = process.argv.slice(2);
  if (args.length > 0 && args[0] !== 'all') {
    // Run specific test
    tester.testSpecific(args[0]).then(result => {
      if (result) {
        console.log(`\n🏁 Test '${result.testName}' completed: ${result.success ? 'PASSED' : 'FAILED'}`);
        if (!result.success && result.error) {
          console.log(`Error: ${result.error}`);
        }
      }
      process.exit(result?.success ? 0 : 1);
    }).catch(error => {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    });
  } else {
    // Run all tests
    tester.runAllTests().then(results => {
      const allPassed = results.every(r => r.success);
      process.exit(allPassed ? 0 : 1);
    }).catch(error => {
      console.error('❌ Test suite execution failed:', error);
      process.exit(1);
    });
  }
}
