import { NextRequest, NextResponse } from 'next/server';
import { getWebhookManager } from '@/lib/integrations/WebhookManager';

/**
 * GET /api/webhooks - List all webhooks
 */
export async function GET() {
  try {
    const webhookManager = getWebhookManager();
    const webhooks = webhookManager.listWebhooks();

    return NextResponse.json({
      success: true,
      webhooks
    });

  } catch (error) {
    console.error('Failed to list webhooks:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to list webhooks'
    }, { status: 500 });
  }
}

/**
 * POST /api/webhooks - Register a new webhook
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, url, events, secret, retryAttempts, timeout, headers } = body;

    if (!name || !url || !events || !Array.isArray(events)) {
      return NextResponse.json({
        success: false,
        error: 'Name, URL, and events array are required'
      }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Invalid URL format'
      }, { status: 400 });
    }

    const webhookManager = getWebhookManager();
    const webhookId = await webhookManager.registerWebhook(name, url, events, {
      secret,
      retryAttempts,
      timeout,
      headers
    });

    return NextResponse.json({
      success: true,
      webhookId,
      message: 'Webhook registered successfully'
    });

  } catch (error) {
    console.error('Failed to register webhook:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to register webhook'
    }, { status: 500 });
  }
}
