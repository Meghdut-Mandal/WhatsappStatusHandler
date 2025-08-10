'use client';

import React, { useState, useMemo } from 'react';
import { formatDistanceToNow, format } from 'date-fns';

export interface SendHistoryItem {
  id: string;
  targetType: 'status' | 'contact' | 'group' | 'broadcast';
  targetName: string;
  targetId: string;
  files: Array<{
    name: string;
    size: number;
    type: string;
  }>;
  caption?: string;
  status: 'pending' | 'sending' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  messageId?: string;
  deliveryStatus?: 'sent' | 'delivered' | 'read';
}

interface SendHistoryFilters {
  targetType: 'all' | 'status' | 'contact' | 'group' | 'broadcast';
  status: 'all' | 'pending' | 'sending' | 'completed' | 'failed' | 'cancelled';
  dateRange: 'all' | '1h' | '24h' | '7d' | '30d' | 'custom';
  search: string;
}

interface SendHistoryProps {
  items: SendHistoryItem[];
  loading?: boolean;
  onRefresh?: () => void;
  onExport?: (filters: SendHistoryFilters) => void;
  className?: string;
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  sending: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

const targetTypeIcons = {
  status: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  contact: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  group: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  broadcast: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
};

export const SendHistory: React.FC<SendHistoryProps> = ({
  items,
  loading = false,
  onRefresh,
  onExport,
  className = '',
}) => {
  const [filters, setFilters] = useState<SendHistoryFilters>({
    targetType: 'all',
    status: 'all',
    dateRange: 'all',
    search: '',
  });

  const [sortBy, setSortBy] = useState<'createdAt' | 'completedAt' | 'targetName'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showDetails, setShowDetails] = useState<string | null>(null);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Apply filters
    if (filters.targetType !== 'all') {
      filtered = filtered.filter(item => item.targetType === filters.targetType);
    }

    if (filters.status !== 'all') {
      filtered = filtered.filter(item => item.status === filters.status);
    }

    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(item => 
        item.targetName.toLowerCase().includes(searchTerm) ||
        item.caption?.toLowerCase().includes(searchTerm) ||
        item.files.some(file => file.name.toLowerCase().includes(searchTerm))
      );
    }

    // Apply date range filter
    if (filters.dateRange !== 'all') {
      const now = new Date();
      let cutoffDate: Date;
      
      switch (filters.dateRange) {
        case '1h':
          cutoffDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoffDate = new Date(0);
      }
      
      filtered = filtered.filter(item => item.createdAt >= cutoffDate);
    }

    // Sort items
    return filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'createdAt':
          aValue = a.createdAt.getTime();
          bValue = b.createdAt.getTime();
          break;
        case 'completedAt':
          aValue = a.completedAt?.getTime() || 0;
          bValue = b.completedAt?.getTime() || 0;
          break;
        case 'targetName':
          aValue = a.targetName.toLowerCase();
          bValue = b.targetName.toLowerCase();
          break;
        default:
          return 0;
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [items, filters, sortBy, sortOrder]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleExport = () => {
    if (onExport) {
      onExport(filters);
    }
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-4"></div>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header and Filters */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Send History</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={onRefresh}
              className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Export
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Target Type</label>
            <select
              value={filters.targetType}
              onChange={(e) => setFilters(prev => ({ ...prev, targetType: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="status">Status</option>
              <option value="contact">Contact</option>
              <option value="group">Group</option>
              <option value="broadcast">Broadcast</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="sending">Sending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date Range</label>
            <select
              value={filters.dateRange}
              onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Time</option>
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              placeholder="Search by name, caption..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-600">
            {filteredItems.length} of {items.length} sends
          </div>
          
          <div className="flex items-center space-x-2">
            <label className="text-xs font-medium text-gray-700">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="createdAt">Created</option>
              <option value="completedAt">Completed</option>
              <option value="targetName">Target Name</option>
            </select>
            <button
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {/* History List */}
        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-gray-500">No sends match your current filters</p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="flex-shrink-0 p-2 bg-gray-100 rounded-lg">
                      {targetTypeIcons[item.targetType]}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="text-sm font-medium text-gray-900">{item.targetName}</h4>
                        <span className={`px-2 py-1 text-xs rounded-full ${statusColors[item.status]}`}>
                          {item.status}
                        </span>
                      </div>
                      
                      <p className="text-xs text-gray-600 mb-2">
                        {item.files.length} file{item.files.length !== 1 ? 's' : ''} • 
                        {item.files.reduce((sum, file) => sum + file.size, 0) > 0 && (
                          <span> {formatFileSize(item.files.reduce((sum, file) => sum + file.size, 0))} • </span>
                        )}
                        {format(item.createdAt, 'MMM d, yyyy HH:mm')}
                      </p>
                      
                      {item.caption && (
                        <p className="text-sm text-gray-700 mb-2 line-clamp-2">{item.caption}</p>
                      )}
                      
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>To: {item.targetType}</span>
                        {item.completedAt && (
                          <span>Completed {formatDistanceToNow(item.completedAt, { addSuffix: true })}</span>
                        )}
                        {item.error && (
                          <span className="text-red-600">Error: {item.error}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => setShowDetails(showDetails === item.id ? null : item.id)}
                    className="text-gray-400 hover:text-gray-600 p-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                
                {/* Expanded Details */}
                {showDetails === item.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h5 className="text-xs font-medium text-gray-700 mb-2">Files</h5>
                        <div className="space-y-1">
                          {item.files.map((file, index) => (
                            <div key={index} className="text-xs text-gray-600 flex items-center justify-between">
                              <span className="truncate">{file.name}</span>
                              <span>{formatFileSize(file.size)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <h5 className="text-xs font-medium text-gray-700 mb-2">Details</h5>
                        <div className="text-xs text-gray-600 space-y-1">
                          <div>Target ID: {item.targetId}</div>
                          {item.messageId && <div>Message ID: {item.messageId}</div>}
                          {item.deliveryStatus && (
                            <div>Delivery: {item.deliveryStatus}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
