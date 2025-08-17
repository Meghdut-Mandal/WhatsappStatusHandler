import { NextRequest, NextResponse } from 'next/server';
import { getBaileysManager } from '@/lib/socketManager';
// Initialize WebSocket polyfills early
import '@/lib/init-websocket';

/**
 * POST /api/auth/pairing - Request pairing code for phone number
 * Alternative to QR code authentication as per Baileys guide
 */
export async function POST(request: NextRequest) {
  try {
    const { phoneNumber } = await request.json();
    
    if (!phoneNumber) {
      return NextResponse.json({
        success: false,
        error: 'Phone number is required',
      }, { status: 400 });
    }

    // Validate phone number format (numbers only, no +, (), -)
    const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return NextResponse.json({
        success: false,
        error: 'Invalid phone number format. Please provide country code + phone number (numbers only)',
      }, { status: 400 });
    }

    const baileysManager = getBaileysManager();
    
    // Check if manager can request pairing code
    if (!baileysManager.canRequestPairingCode()) {
      return NextResponse.json({
        success: false,
        error: 'Cannot request pairing code. Socket may not be initialized or already registered.',
      }, { status: 400 });
    }

    // Request pairing code
    const pairingCode = await baileysManager.requestPairingCode(cleanPhone);
    
    if (!pairingCode) {
      return NextResponse.json({
        success: false,
        error: 'Failed to generate pairing code',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      pairingCode: pairingCode,
      phoneNumber: cleanPhone,
      message: 'Pairing code generated successfully. Enter this code in WhatsApp > Linked Devices > Link a Device > Link with phone number',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Pairing code generation error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate pairing code',
    }, { status: 500 });
  }
}
