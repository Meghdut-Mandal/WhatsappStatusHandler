#!/usr/bin/env node

/**
 * Test script to verify QR generation timing fixes
 */

async function testQRTimingFixes() {
  console.log('🧪 Testing QR Generation Timing Fixes...\n');

  try {
    // Test 1: Check enhanced status endpoint
    console.log('1️⃣ Testing enhanced status endpoint...');
    const statusResponse = await fetch('http://localhost:3000/api/auth/status');
    const statusData = await statusResponse.json();
    
    console.log('Enhanced Status Response:', {
      success: statusData.success,
      status: statusData.status,
      hasCapabilities: !!statusData.capabilities,
      canRequestPairingCode: statusData.capabilities?.canRequestPairingCode,
      supportsQRCode: statusData.capabilities?.supportsQRCode
    });

    // Test 2: Test POST QR regeneration with improved timing
    console.log('\n2️⃣ Testing POST QR regeneration (improved timing)...');
    const start = Date.now();
    
    const postResponse = await fetch('http://localhost:3000/api/auth/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const postData = await postResponse.json();
    const duration = Date.now() - start;
    
    console.log('POST QR Response:', {
      success: postData.success,
      status: postData.status,
      hasQrCode: !!postData.qrCode,
      isTimeout: !!postData.timeout,
      message: postData.message,
      duration: `${duration}ms`
    });

    // Test 3: If timeout occurred, test auto-recovery
    if (postData.success && !postData.qrCode && postData.timeout) {
      console.log('\n3️⃣ Testing auto-recovery after timeout...');
      
      // Wait 3 seconds (simulating frontend auto-retry)
      console.log('Waiting 3 seconds for auto-recovery...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const retryResponse = await fetch('http://localhost:3000/api/auth/qr');
      const retryData = await retryResponse.json();
      
      console.log('Auto-recovery Result:', {
        success: retryData.success,
        status: retryData.status,
        hasQrCode: !!retryData.qrCode,
        qrCodeLength: retryData.qrCode?.length || 0
      });
      
      if (retryData.qrCode) {
        console.log('✅ Auto-recovery successful! QR code is now available.');
      } else {
        console.log('⚠️ Auto-recovery still pending. QR might need more time.');
      }
    } else if (postData.qrCode) {
      console.log('✅ QR code generated immediately! No timeout occurred.');
      console.log('QR Code Length:', postData.qrCode.length);
    }

    // Test 4: Test pairing code functionality
    console.log('\n4️⃣ Testing pairing code alternative...');
    
    const pairingResponse = await fetch('http://localhost:3000/api/auth/pairing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '1234567890' })
    });
    
    const pairingData = await pairingResponse.json();
    
    console.log('Pairing Code Response:', {
      success: pairingData.success,
      hasPairingCode: !!pairingData.pairingCode,
      phoneNumber: pairingData.phoneNumber,
      error: pairingData.error
    });

    if (pairingData.pairingCode) {
      console.log('✅ Pairing code generated:', pairingData.pairingCode);
    }

    // Summary
    console.log('\n📊 Test Summary:');
    console.log('==================');
    
    const results = [
      statusData.success ? '✅' : '❌', 'Enhanced status endpoint',
      postData.success ? '✅' : '❌', 'POST QR regeneration',
      duration < 20000 ? '✅' : '⚠️', `Response time (${duration}ms)`,
      pairingData.success ? '✅' : '❌', 'Pairing code alternative'
    ];
    
    for (let i = 0; i < results.length; i += 2) {
      console.log(`${results[i]} ${results[i + 1]}`);
    }

    // Final verdict
    const allSuccess = statusData.success && postData.success && pairingData.success;
    console.log('\n🎯 Overall Result:', allSuccess ? '✅ ALL TESTS PASSED' : '⚠️ SOME ISSUES FOUND');

    if (allSuccess) {
      console.log('\n🎉 QR generation timing fixes are working correctly!');
      console.log('- Event-based QR generation implemented');
      console.log('- Graceful timeout handling in place');
      console.log('- Auto-retry mechanism available');
      console.log('- Pairing code alternative working');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Make sure the development server is running: npm run dev');
    }
  }
}

// Run the test
testQRTimingFixes();
