import { NextRequest, NextResponse } from 'next/server';
import { SendHistoryService, SessionService } from '@/lib/db';

/**
 * GET /api/send/history - Get send history with filtering and search
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const sessionId = searchParams.get('sessionId');
    const targetType = searchParams.get('targetType');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const exportFormat = searchParams.get('export'); // 'json', 'csv'

    // Get active session if no sessionId provided
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const activeSession = await SessionService.getActive();
      if (!activeSession) {
        return NextResponse.json({
          success: false,
          error: 'No active session found',
        }, { status: 400 });
      }
      activeSessionId = activeSession.id;
    }

    // Build filters
    const filters: any = {
      limit,
      offset,
      sortBy: sortBy as 'createdAt' | 'completedAt' | 'targetType',
      sortOrder: sortOrder as 'asc' | 'desc',
    };

    if (targetType && targetType !== 'all') {
      filters.targetType = targetType;
    }

    if (status && status !== 'all') {
      filters.status = status;
    }

    if (dateFrom) {
      filters.dateFrom = new Date(dateFrom);
    }

    if (dateTo) {
      filters.dateTo = new Date(dateTo);
    }

    // Get send history
    const sendHistory = await SendHistoryService.getBySessionId(activeSessionId, filters);
    const totalCount = await SendHistoryService.getCountBySessionId(activeSessionId, filters);

    // Apply search filter (done in memory for simplicity)
    let filteredHistory = sendHistory;
    if (search) {
      const searchTerm = search.toLowerCase();
      filteredHistory = sendHistory.filter(item => 
        item.targetIdentifier?.toLowerCase().includes(searchTerm) ||
        item.files?.some((file: any) => 
          file.name?.toLowerCase().includes(searchTerm) ||
          file.caption?.toLowerCase().includes(searchTerm)
        )
      );
    }

    // Handle export formats
    if (exportFormat === 'csv') {
      const csv = convertToCSV(filteredHistory);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="send_history_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    if (exportFormat === 'json') {
      const jsonData = {
        exportDate: new Date().toISOString(),
        sessionId: activeSessionId,
        filters,
        totalRecords: filteredHistory.length,
        data: filteredHistory,
      };
      
      return new NextResponse(JSON.stringify(jsonData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="send_history_${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    // Format response data
    const formattedHistory = filteredHistory.map(item => ({
      id: item.id,
      targetType: item.targetType,
      targetName: item.targetIdentifier, // This would be resolved to actual names
      targetId: item.targetIdentifier,
      files: Array.isArray(item.files) ? item.files.map((file: any) => ({
        name: file.name || file.filename || 'Unknown',
        size: file.size || file.sizeBytes || 0,
        type: file.type || file.mimetype || 'unknown',
      })) : [],
      caption: item.files?.[0]?.caption, // Get caption from first file if available
      status: item.status,
      createdAt: item.createdAt,
      completedAt: item.completedAt,
      error: item.status === 'failed' ? 'Send failed' : undefined,
      messageId: item.messageId,
    }));

    // Get statistics
    const stats = await getHistoryStatistics(activeSessionId);

    return NextResponse.json({
      success: true,
      history: formattedHistory,
      pagination: {
        total: totalCount,
        returned: formattedHistory.length,
        offset,
        limit,
        hasMore: offset + limit < totalCount,
      },
      statistics: stats,
      filters: {
        sessionId: activeSessionId,
        targetType,
        status,
        search,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder,
      },
    });

  } catch (error) {
    console.error('Get send history error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get send history',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/send/history - Clear send history
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const historyId = searchParams.get('historyId');
    const clearAll = searchParams.get('clearAll') === 'true';
    const olderThan = searchParams.get('olderThan'); // ISO date string

    // Get active session if no sessionId provided
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const activeSession = await SessionService.getActive();
      if (!activeSession) {
        return NextResponse.json({
          success: false,
          error: 'No active session found',
        }, { status: 400 });
      }
      activeSessionId = activeSession.id;
    }

    let deletedCount = 0;

    if (historyId) {
      // Delete specific history item
      const deleted = await SendHistoryService.delete(historyId);
      deletedCount = deleted ? 1 : 0;
    } else if (clearAll) {
      // Clear all history for session
      deletedCount = await SendHistoryService.clearBySessionId(activeSessionId);
    } else if (olderThan) {
      // Clear history older than specified date
      const cutoffDate = new Date(olderThan);
      deletedCount = await SendHistoryService.clearOlderThan(activeSessionId, cutoffDate);
    } else {
      return NextResponse.json({
        success: false,
        error: 'Must specify historyId, clearAll=true, or olderThan parameter',
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `${deletedCount} history item${deletedCount !== 1 ? 's' : ''} deleted`,
      deletedCount,
    });

  } catch (error) {
    console.error('Delete send history error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete send history',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * Helper function to get history statistics
 */
async function getHistoryStatistics(sessionId: string) {
  try {
    const allHistory = await SendHistoryService.getBySessionId(sessionId, { limit: 10000 });
    
    const stats = {
      total: allHistory.length,
      completed: allHistory.filter(h => h.status === 'completed').length,
      failed: allHistory.filter(h => h.status === 'failed').length,
      pending: allHistory.filter(h => h.status === 'pending').length,
      byTargetType: {
        status: allHistory.filter(h => h.targetType === 'status').length,
        contact: allHistory.filter(h => h.targetType === 'contact').length,
        group: allHistory.filter(h => h.targetType === 'group').length,
        broadcast: allHistory.filter(h => h.targetType === 'broadcast').length,
      },
      totalFiles: allHistory.reduce((sum, h) => sum + (Array.isArray(h.files) ? h.files.length : 0), 0),
      totalSize: allHistory.reduce((sum, h) => {
        if (!Array.isArray(h.files)) return sum;
        return sum + h.files.reduce((fileSum: number, file: any) => 
          fileSum + (file.size || file.sizeBytes || 0), 0
        );
      }, 0),
    };

    return {
      ...stats,
      successRate: stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
    };

  } catch (error) {
    console.error('Failed to calculate statistics:', error);
    return {
      total: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      byTargetType: { status: 0, contact: 0, group: 0, broadcast: 0 },
      totalFiles: 0,
      totalSize: 0,
      successRate: 0,
    };
  }
}

/**
 * Helper function to convert history to CSV format
 */
function convertToCSV(history: any[]): string {
  if (history.length === 0) {
    return 'No data available';
  }

  const headers = [
    'ID',
    'Target Type',
    'Target ID',
    'Files Count',
    'Total Size',
    'Status',
    'Created At',
    'Completed At',
    'Message ID',
  ];

  const csvRows = [
    headers.join(','),
    ...history.map(item => [
      item.id,
      item.targetType,
      item.targetIdentifier,
      Array.isArray(item.files) ? item.files.length : 0,
      Array.isArray(item.files) ? item.files.reduce((sum: number, f: any) => sum + (f.size || 0), 0) : 0,
      item.status,
      item.createdAt.toISOString(),
      item.completedAt ? item.completedAt.toISOString() : '',
      item.messageId || '',
    ].map(field => `"${field}"`).join(','))
  ];

  return csvRows.join('\n');
}