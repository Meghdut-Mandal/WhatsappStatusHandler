import { NextRequest, NextResponse } from 'next/server';
import { getWebhookManager } from '@/lib/integrations/WebhookManager';

interface RouteParams {
  params: Promise<{
    webhookId: string;
  }>;
}

/**
 * GET /api/webhooks/[webhookId] - Get webhook by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { webhookId } = await params;
    const webhookManager = getWebhookManager();
    const webhook = webhookManager.getWebhook(webhookId);

    if (!webhook) {
      return NextResponse.json({
        success: false,
        error: 'Webhook not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      webhook
    });

  } catch (error) {
    console.error('Failed to get webhook:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get webhook'
    }, { status: 500 });
  }
}

/**
 * PUT /api/webhooks/[webhookId] - Update webhook
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { webhookId } = await params;
    const body = await request.json();
    const { name, url, events, secret, enabled, retryAttempts, timeout, headers } = body;

    const webhookManager = getWebhookManager();
    const updated = await webhookManager.updateWebhook(webhookId, {
      name,
      url,
      events,
      secret,
      enabled,
      retryAttempts,
      timeout,
      headers
    });

    if (!updated) {
      return NextResponse.json({
        success: false,
        error: 'Webhook not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook updated successfully'
    });

  } catch (error) {
    console.error('Failed to update webhook:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update webhook'
    }, { status: 500 });
  }
}

/**
 * DELETE /api/webhooks/[webhookId] - Delete webhook
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { webhookId } = await params;
    const webhookManager = getWebhookManager();
    const deleted = await webhookManager.unregisterWebhook(webhookId);

    if (!deleted) {
      return NextResponse.json({
        success: false,
        error: 'Webhook not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook deleted successfully'
    });

  } catch (error) {
    console.error('Failed to delete webhook:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete webhook'
    }, { status: 500 });
  }
}
