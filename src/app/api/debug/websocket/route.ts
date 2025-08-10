import { NextRequest, NextResponse } from 'next/server';
import { webSocketDiagnostics } from '@/lib/utils/websocket-diagnostics';

/**
 * GET /api/debug/websocket - Run WebSocket diagnostics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const quick = searchParams.get('quick') === 'true';

    if (quick) {
      // Quick health check
      const isHealthy = await webSocketDiagnostics.isHealthy();
      return NextResponse.json({
        healthy: isHealthy,
        timestamp: new Date().toISOString(),
        message: isHealthy ? 'WebSocket connections are healthy' : 'WebSocket issues detected'
      });
    }

    if (format === 'text') {
      // Return formatted text report
      const report = await webSocketDiagnostics.getReport();
      return new NextResponse(report, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    } else {
      // Return JSON results
      const resultsJson = await webSocketDiagnostics.getResultsAsJSON();
      const results = JSON.parse(resultsJson);
      
      return NextResponse.json(results);
    }

  } catch (error) {
    console.error('WebSocket diagnostics error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST /api/debug/websocket - Force run diagnostics with specific options
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { includeDetails = true, categories = [] } = body;

    // Run full diagnostics
    const results = await webSocketDiagnostics.runDiagnostics();
    
    // Filter by categories if specified
    const filteredResults = categories.length > 0 
      ? results.filter(r => categories.includes(r.category))
      : results;

    // Remove details if not requested
    const finalResults = includeDetails 
      ? filteredResults 
      : filteredResults.map(r => ({ ...r, details: undefined }));

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: finalResults,
      summary: {
        total: finalResults.length,
        ok: finalResults.filter(r => r.status === 'ok').length,
        warnings: finalResults.filter(r => r.status === 'warning').length,
        errors: finalResults.filter(r => r.status === 'error').length
      }
    });

  } catch (error) {
    console.error('WebSocket diagnostics POST error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
