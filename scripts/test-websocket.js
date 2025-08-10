#!/usr/bin/env node

/**
 * WebSocket Connection Test Runner
 * 
 * Usage:
 *   npm run test:websocket              # Run all tests
 *   npm run test:websocket disconnect   # Run specific test
 *   node scripts/test-websocket.js      # Direct execution
 */

const { spawn } = require('child_process');
const path = require('path');

const testFile = path.join(__dirname, '..', 'tests', 'websocket-connection-test.ts');
const args = process.argv.slice(2);

console.log('🚀 Starting WebSocket Connection Tests...\n');

// Use ts-node to run the TypeScript test file
const child = spawn('npx', ['ts-node', '--esm', testFile, ...args], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    NODE_ENV: 'test'
  }
});

child.on('close', (code) => {
  console.log(`\n🏁 Test runner finished with exit code: ${code}`);
  process.exit(code);
});

child.on('error', (error) => {
  console.error('❌ Failed to start test runner:', error.message);
  process.exit(1);
});
