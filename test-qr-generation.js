#!/usr/bin/env node

/**
 * Simple test script to verify QR code generation
 */

async function testQRGeneration() {
  console.log('Testing QR code generation...');
  
  try {
    // Test the status endpoint first
    console.log('\n1. Testing auth status endpoint...');
    const statusResponse = await fetch('http://localhost:3000/api/auth/status');
    const statusData = await statusResponse.json();
    console.log('Status:', statusData);
    
    // Wait a moment for initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test the QR endpoint
    console.log('\n2. Testing QR code endpoint...');
    const qrResponse = await fetch('http://localhost:3000/api/auth/qr');
    const qrData = await qrResponse.json();
    console.log('QR Response:', {
      success: qrData.success,
      status: qrData.status,
      hasQrCode: !!qrData.qrCode,
      qrCodeLength: qrData.qrCode ? qrData.qrCode.length : 0,
      message: qrData.message,
      error: qrData.error
    });
    
    if (qrData.qrCode) {
      console.log('\n✅ QR code generated successfully!');
      console.log('QR code starts with:', qrData.qrCode.substring(0, 50) + '...');
    } else {
      console.log('\n⚠️  No QR code available yet. Status:', qrData.status);
      
      // Try generating a new QR code
      console.log('\n3. Attempting to generate new QR code...');
      const generateResponse = await fetch('http://localhost:3000/api/auth/qr', {
        method: 'POST'
      });
      const generateData = await generateResponse.json();
      console.log('Generate Response:', {
        success: generateData.success,
        status: generateData.status,
        hasQrCode: !!generateData.qrCode,
        message: generateData.message,
        error: generateData.error
      });
      
      // Wait a bit more and try again
      console.log('\n4. Waiting 3 seconds and checking again...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const finalResponse = await fetch('http://localhost:3000/api/auth/qr');
      const finalData = await finalResponse.json();
      console.log('Final QR Response:', {
        success: finalData.success,
        status: finalData.status,
        hasQrCode: !!finalData.qrCode,
        message: finalData.message,
        error: finalData.error
      });
      
      if (finalData.qrCode) {
        console.log('\n✅ QR code generated successfully after retry!');
      } else {
        console.log('\n❌ QR code still not available');
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n❌ Make sure the development server is running: npm run dev');
    }
  }
}

// Run the test
testQRGeneration();
