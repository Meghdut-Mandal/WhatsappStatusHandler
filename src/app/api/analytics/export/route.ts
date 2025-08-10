import { NextRequest, NextResponse } from 'next/server';
import { SendHistoryService } from '@/lib/db';

/**
 * GET /api/analytics/export - Export analytics data as CSV
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '7d';

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    
    switch (range) {
      case '1d':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default: // 7d
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
    }

    // Get send history data
    const sendHistory = await SendHistoryService.findMany({
      where: {
        createdAt: {
          gte: startDate
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Generate CSV content
    const csvHeaders = [
      'Date',
      'Session ID',
      'Target Type',
      'Target Identifier', 
      'Files',
      'Status',
      'Created At',
      'Completed At'
    ];

    const csvRows = sendHistory.map(record => [
      record.createdAt.toISOString().split('T')[0],
      record.sessionId,
      record.targetType,
      record.targetIdentifier,
      Array.isArray(record.files) ? record.files.join(';') : record.files,
      record.status,
      record.createdAt.toISOString(),
      record.completedAt?.toISOString() || ''
    ]);

    // Convert to CSV string
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(cell => 
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
      ).join(','))
    ].join('\n');

    // Return CSV file
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="analytics-export-${range}-${new Date().toISOString().split('T')[0]}.csv"`
      }
    });

  } catch (error) {
    console.error('Failed to export analytics data:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to export analytics data'
    }, { status: 500 });
  }
}
