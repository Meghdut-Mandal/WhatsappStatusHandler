/**
 * WebSocket Diagnostics Utility
 * 
 * Provides comprehensive diagnostics for WebSocket connections
 * and helps debug connection issues in production.
 */

import { getBaileysManager } from '../socketManager';
import { errorHandler } from '../errors/ErrorHandler';
import { isWebSocketPolyfillReady, getBufferUtil, getUtf8Validate } from './websocket-polyfill';

export interface DiagnosticResult {
  timestamp: Date;
  category: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: any;
}

export interface SystemInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  uptime: number;
}

export class WebSocketDiagnostics {
  private results: DiagnosticResult[] = [];

  /**
   * Run comprehensive diagnostics
   */
  async runDiagnostics(): Promise<DiagnosticResult[]> {
    this.results = [];
    
    this.checkSystemInfo();
    this.checkWebSocketPolyfills();
    this.checkBaileysManager();
    await this.checkConnectionState();
    this.checkErrorHandler();
    this.checkEnvironment();
    
    return this.results;
  }

  /**
   * Get formatted diagnostic report
   */
  async getReport(): Promise<string> {
    const results = await this.runDiagnostics();
    
    let report = '🔍 WebSocket Diagnostics Report\n';
    report += '================================\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;
    
    const categories = [...new Set(results.map(r => r.category))];
    
    for (const category of categories) {
      report += `📂 ${category}\n`;
      report += '-'.repeat(category.length + 2) + '\n';
      
      const categoryResults = results.filter(r => r.category === category);
      for (const result of categoryResults) {
        const icon = this.getStatusIcon(result.status);
        report += `${icon} ${result.message}\n`;
        
        if (result.details) {
          const detailsStr = typeof result.details === 'object' 
            ? JSON.stringify(result.details, null, 2) 
            : String(result.details);
          report += `   ${detailsStr.split('\n').join('\n   ')}\n`;
        }
      }
      report += '\n';
    }
    
    // Summary
    const okCount = results.filter(r => r.status === 'ok').length;
    const warningCount = results.filter(r => r.status === 'warning').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    
    report += '📊 Summary\n';
    report += '----------\n';
    report += `✅ OK: ${okCount}\n`;
    report += `⚠️  Warnings: ${warningCount}\n`;
    report += `❌ Errors: ${errorCount}\n`;
    report += `📊 Total Checks: ${results.length}\n`;
    
    if (errorCount > 0) {
      report += '\n🚨 Critical Issues Found!\n';
      report += 'Please address the errors above before proceeding.\n';
    } else if (warningCount > 0) {
      report += '\n⚠️  Some warnings detected.\n';
      report += 'Review the warnings above for optimal performance.\n';
    } else {
      report += '\n🎉 All checks passed!\n';
      report += 'WebSocket connections should work correctly.\n';
    }
    
    return report;
  }

  private checkSystemInfo(): void {
    try {
      const systemInfo: SystemInfo = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
          percentage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100
        },
        uptime: process.uptime()
      };

      this.addResult('System', 'ok', 'System information collected', systemInfo);

      // Check Node.js version
      const nodeVersion = process.version.slice(1); // Remove 'v' prefix
      const [major] = nodeVersion.split('.').map(Number);
      
      if (major < 16) {
        this.addResult('System', 'warning', `Node.js version ${process.version} is outdated. Recommend v16+`);
      } else {
        this.addResult('System', 'ok', `Node.js version ${process.version} is supported`);
      }

      // Check memory usage
      if (systemInfo.memory.percentage > 80) {
        this.addResult('System', 'warning', `High memory usage: ${systemInfo.memory.percentage.toFixed(1)}%`);
      } else {
        this.addResult('System', 'ok', `Memory usage normal: ${systemInfo.memory.percentage.toFixed(1)}%`);
      }

    } catch (error) {
      this.addResult('System', 'error', 'Failed to collect system information', error);
    }
  }

  private checkWebSocketPolyfills(): void {
    try {
      // Check if polyfills are ready
      if (isWebSocketPolyfillReady()) {
        this.addResult('WebSocket Polyfills', 'ok', 'WebSocket polyfills are properly initialized');
      } else {
        this.addResult('WebSocket Polyfills', 'error', 'WebSocket polyfills are not properly initialized');
      }

      // Check buffer utilities
      const bufferUtil = getBufferUtil();
      if (bufferUtil && bufferUtil.mask && bufferUtil.unmask) {
        this.addResult('WebSocket Polyfills', 'ok', 'Buffer utilities available');
      } else {
        this.addResult('WebSocket Polyfills', 'warning', 'Buffer utilities using fallback implementation');
      }

      // Check UTF-8 validation
      const utf8Validate = getUtf8Validate();
      if (utf8Validate) {
        this.addResult('WebSocket Polyfills', 'ok', 'UTF-8 validation available');
        
        // Test UTF-8 validation
        const testBuffer = Buffer.from('Hello, World!', 'utf8');
        const isValid = utf8Validate(testBuffer);
        if (isValid) {
          this.addResult('WebSocket Polyfills', 'ok', 'UTF-8 validation working correctly');
        } else {
          this.addResult('WebSocket Polyfills', 'warning', 'UTF-8 validation may not be working correctly');
        }
      } else {
        this.addResult('WebSocket Polyfills', 'error', 'UTF-8 validation not available');
      }

      // Check global availability
      if (typeof global !== 'undefined') {
        // @ts-ignore
        const globalBufferUtil = global.bufferUtil;
        // @ts-ignore
        const globalUtf8Validate = global.utf8Validate;
        
        if (globalBufferUtil && globalUtf8Validate) {
          this.addResult('WebSocket Polyfills', 'ok', 'Global WebSocket utilities available');
        } else {
          this.addResult('WebSocket Polyfills', 'warning', 'Global WebSocket utilities not fully available');
        }
      }

    } catch (error) {
      this.addResult('WebSocket Polyfills', 'error', 'Error checking WebSocket polyfills', error);
    }
  }

  private checkBaileysManager(): void {
    try {
      const manager = getBaileysManager();
      
      if (manager) {
        this.addResult('Baileys Manager', 'ok', 'BaileysManager instance available');
        
        // Check manager methods
        const requiredMethods = [
          'initialize', 'disconnect', 'getConnectionStatus', 
          'getSocket', 'isSocketReady', 'getSocketState'
        ];
        
        for (const method of requiredMethods) {
          if (typeof manager[method as keyof typeof manager] === 'function') {
            this.addResult('Baileys Manager', 'ok', `Method ${method} available`);
          } else {
            this.addResult('Baileys Manager', 'error', `Method ${method} not available`);
          }
        }
        
      } else {
        this.addResult('Baileys Manager', 'error', 'BaileysManager instance not available');
      }

    } catch (error) {
      this.addResult('Baileys Manager', 'error', 'Error checking BaileysManager', error);
    }
  }

  private async checkConnectionState(): Promise<void> {
    try {
      const manager = getBaileysManager();
      
      // Check connection status
      const status = manager.getConnectionStatus();
      this.addResult('Connection State', 'ok', `Connection status: ${status.status}`, status);
      
      // Check socket state
      const socketState = manager.getSocketState();
      this.addResult('Connection State', 'ok', `Socket state: ${socketState}`);
      
      // Check if socket is ready
      const isReady = manager.isSocketReady();
      this.addResult('Connection State', 'ok', `Socket ready: ${isReady}`);
      
      // Check socket instance
      const socket = manager.getSocket();
      if (socket) {
        this.addResult('Connection State', 'ok', 'Socket instance available');
        
        if (socket.ws) {
          this.addResult('Connection State', 'ok', `WebSocket readyState: ${socket.ws.readyState}`);
          
          // Check WebSocket properties
          const wsInfo = {
            readyState: socket.ws.readyState,
            url: socket.ws.url || 'N/A',
            protocol: socket.ws.protocol || 'N/A',
            extensions: socket.ws.extensions || 'N/A'
          };
          this.addResult('Connection State', 'ok', 'WebSocket details', wsInfo);
        } else {
          this.addResult('Connection State', 'warning', 'Socket instance has no WebSocket');
        }
      } else {
        this.addResult('Connection State', 'ok', 'No socket instance (normal if disconnected)');
      }

    } catch (error) {
      this.addResult('Connection State', 'error', 'Error checking connection state', error);
    }
  }

  private checkErrorHandler(): void {
    try {
      const stats = errorHandler.getErrorStats();
      this.addResult('Error Handler', 'ok', 'Error handler available', {
        totalErrors: stats.total,
        recentErrors: stats.recent.length
      });
      
      // Check if there are critical errors
      const criticalErrors = stats.bySeverity.critical || 0;
      if (criticalErrors > 0) {
        this.addResult('Error Handler', 'warning', `${criticalErrors} critical errors recorded`);
      }
      
      // Check error categories
      const whatsappErrors = stats.byCategory.whatsapp || 0;
      if (whatsappErrors > 0) {
        this.addResult('Error Handler', 'warning', `${whatsappErrors} WhatsApp errors recorded`);
      }

    } catch (error) {
      this.addResult('Error Handler', 'error', 'Error checking error handler', error);
    }
  }

  private checkEnvironment(): void {
    try {
      // Check environment variables
      const nodeEnv = process.env.NODE_ENV;
      this.addResult('Environment', 'ok', `NODE_ENV: ${nodeEnv || 'not set'}`);
      
      // Check if in development mode
      if (nodeEnv === 'development') {
        this.addResult('Environment', 'ok', 'Running in development mode - additional debugging available');
      }
      
      // Check for required directories
      const fs = require('fs');
      const path = require('path');
      
      const requiredDirs = [
        'data/auth_sessions',
        'tmp'
      ];
      
      for (const dir of requiredDirs) {
        const fullPath = path.join(process.cwd(), dir);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            this.addResult('Environment', 'ok', `Directory exists: ${dir}`);
          } else {
            this.addResult('Environment', 'warning', `Path exists but is not a directory: ${dir}`);
          }
        } catch {
          this.addResult('Environment', 'warning', `Directory missing: ${dir}`);
        }
      }

    } catch (error) {
      this.addResult('Environment', 'error', 'Error checking environment', error);
    }
  }

  private addResult(category: string, status: 'ok' | 'warning' | 'error', message: string, details?: any): void {
    this.results.push({
      timestamp: new Date(),
      category,
      status,
      message,
      details
    });
  }

  private getStatusIcon(status: 'ok' | 'warning' | 'error'): string {
    switch (status) {
      case 'ok': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return '❓';
    }
  }

  /**
   * Quick health check - returns true if no critical issues found
   */
  async isHealthy(): Promise<boolean> {
    const results = await this.runDiagnostics();
    return !results.some(r => r.status === 'error');
  }

  /**
   * Get diagnostic results as JSON
   */
  async getResultsAsJSON(): Promise<string> {
    const results = await this.runDiagnostics();
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      results,
      summary: {
        total: results.length,
        ok: results.filter(r => r.status === 'ok').length,
        warnings: results.filter(r => r.status === 'warning').length,
        errors: results.filter(r => r.status === 'error').length
      }
    }, null, 2);
  }
}

// Export singleton instance
export const webSocketDiagnostics = new WebSocketDiagnostics();

// Utility function for quick diagnostics
export async function runQuickDiagnostics(): Promise<string> {
  return await webSocketDiagnostics.getReport();
}

// Utility function for health check
export async function isWebSocketHealthy(): Promise<boolean> {
  return await webSocketDiagnostics.isHealthy();
}
