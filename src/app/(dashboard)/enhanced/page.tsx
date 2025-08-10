'use client';

import React, { useEffect, useState } from 'react';
import { MainContent, ContentSection } from '../../components/layout/MainContent';
import { 
  StatisticsWidget, 
  ActivityOverview, 
  SendHistory,
  type StatisticItem, 
  type ActivityItem,
  type SendHistoryItem 
} from '../../components/ui';

interface DashboardData {
  statistics: {
    upload: StatisticItem[];
    whatsapp: StatisticItem[];
    files: StatisticItem[];
  };
  activities: ActivityItem[];
  sendHistory: SendHistoryItem[];
  analytics: {
    totalUploads: number;
    totalSent: number;
    successRate: number;
    averageFileSize: number;
    bandwidthUsage: number;
  };
}

export default function EnhancedDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'analytics'>('overview');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch data from multiple APIs in parallel
      const [
        connectionResponse,
        analyticsResponse,
        historyResponse,
        uploadStatsResponse,
      ] = await Promise.all([
        fetch('/api/auth/status'),
        fetch('/api/upload/analytics?detailed=true'),
        fetch('/api/send/history?limit=10'),
        fetch('/api/upload?active=false'),
      ]);

      const connectionData = await connectionResponse.json();
      const analyticsData = await analyticsResponse.json();
      const historyData = await historyResponse.json();
      const uploadStatsData = await uploadStatsResponse.json();

      // Process and format the data
      const dashboardData: DashboardData = {
        statistics: {
          upload: [
            {
              label: 'Total Uploads',
              value: analyticsData.upload?.totalUploads || 0,
              change: { value: 12, type: 'increase', period: 'vs last week' },
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              ),
              color: 'blue',
            },
            {
              label: 'Active Uploads',
              value: analyticsData.upload?.activeUploads || 0,
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              color: 'yellow',
            },
            {
              label: 'Success Rate',
              value: `${analyticsData.upload?.successRate?.toFixed(1) || 0}%`,
              change: { value: 5, type: 'increase', period: 'vs last week' },
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              color: 'green',
            },
          ],
          whatsapp: [
            {
              label: 'Connection Status',
              value: connectionData.success && connectionData.status === 'connected' ? 'Connected' : 'Disconnected',
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
              ),
              color: connectionData.success && connectionData.status === 'connected' ? 'green' : 'red',
            },
            {
              label: 'Messages Sent',
              value: historyData.statistics?.completed || 0,
              change: { value: 8, type: 'increase', period: 'vs yesterday' },
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              ),
              color: 'blue',
            },
            {
              label: 'Status Updates',
              value: historyData.statistics?.byTargetType?.status || 0,
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              color: 'purple',
            },
          ],
          files: [
            {
              label: 'Total Files',
              value: historyData.statistics?.totalFiles || 0,
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ),
              color: 'gray',
            },
            {
              label: 'Data Transferred',
              value: formatBytes(historyData.statistics?.totalSize || 0),
              change: { value: 15, type: 'increase', period: 'vs last week' },
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ),
              color: 'blue',
            },
            {
              label: 'Average Size',
              value: formatBytes((historyData.statistics?.totalSize || 0) / Math.max(historyData.statistics?.totalFiles || 1, 1)),
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              ),
              color: 'green',
            },
          ],
        },
        activities: generateMockActivities(historyData.history || []),
        sendHistory: historyData.history || [],
        analytics: {
          totalUploads: analyticsData.upload?.totalUploads || 0,
          totalSent: historyData.statistics?.completed || 0,
          successRate: historyData.statistics?.successRate || 0,
          averageFileSize: (historyData.statistics?.totalSize || 0) / Math.max(historyData.statistics?.totalFiles || 1, 1),
          bandwidthUsage: analyticsData.upload?.bandwidthUsage || 0,
        },
      };

      setData(dashboardData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      // Set fallback data
      setData({
        statistics: { upload: [], whatsapp: [], files: [] },
        activities: [],
        sendHistory: [],
        analytics: {
          totalUploads: 0,
          totalSent: 0,
          successRate: 0,
          averageFileSize: 0,
          bandwidthUsage: 0,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExportHistory = async () => {
    try {
      const response = await fetch('/api/send/history?export=csv');
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `send_history_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  if (loading || !data) {
    return (
      <MainContent 
        title="Enhanced Dashboard" 
        subtitle="Complete overview of your WhatsApp Status Handler"
        loading={true}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
                <div className="h-6 bg-gray-200 rounded mb-4"></div>
                <div className="space-y-3">
                  <div className="h-4 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </MainContent>
    );
  }

  return (
    <MainContent 
      title="Enhanced Dashboard" 
      subtitle="Complete overview of your WhatsApp Status Handler"
      actions={
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchDashboardData}
            className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Refresh
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', name: 'Overview', count: null },
              { id: 'history', name: 'Send History', count: data.sendHistory.length },
              { id: 'analytics', name: 'Analytics', count: null },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
                {tab.count !== null && (
                  <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2.5 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Statistics Widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <StatisticsWidget
                title="Upload Statistics"
                statistics={data.statistics.upload}
              />
              <StatisticsWidget
                title="WhatsApp Status"
                statistics={data.statistics.whatsapp}
              />
              <StatisticsWidget
                title="File Statistics"
                statistics={data.statistics.files}
              />
            </div>

            {/* Activity Overview and Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ActivityOverview
                activities={data.activities}
              />
              
              <ContentSection title="Quick Actions">
                <div className="grid grid-cols-1 gap-4">
                  <button
                    onClick={() => window.location.href = '/upload'}
                    className="p-4 text-left border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0 p-2 bg-blue-50 rounded-lg">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Upload & Send Files</div>
                        <div className="text-sm text-gray-600">Upload photos and videos to send to WhatsApp Status</div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => window.location.href = '/contacts'}
                    className="p-4 text-left border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0 p-2 bg-green-50 rounded-lg">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Manage Contacts</div>
                        <div className="text-sm text-gray-600">View and organize your WhatsApp contacts and groups</div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => window.location.href = '/settings'}
                    className="p-4 text-left border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0 p-2 bg-purple-50 rounded-lg">
                        <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Settings</div>
                        <div className="text-sm text-gray-600">Configure app settings and manage your data</div>
                      </div>
                    </div>
                  </button>
                </div>
              </ContentSection>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <SendHistory
            items={data.sendHistory}
            onRefresh={fetchDashboardData}
            onExport={handleExportHistory}
          />
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="text-2xl font-bold text-gray-900">{data.analytics.totalUploads}</div>
                <div className="text-sm text-gray-600">Total Uploads</div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="text-2xl font-bold text-gray-900">{data.analytics.totalSent}</div>
                <div className="text-sm text-gray-600">Messages Sent</div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="text-2xl font-bold text-gray-900">{data.analytics.successRate.toFixed(1)}%</div>
                <div className="text-sm text-gray-600">Success Rate</div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="text-2xl font-bold text-gray-900">{formatBytes(data.analytics.averageFileSize)}</div>
                <div className="text-sm text-gray-600">Avg File Size</div>
              </div>
            </div>

            {/* Charts would go here in a real implementation */}
            <ContentSection title="Performance Charts">
              <div className="text-center py-12 text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Performance charts and analytics visualizations would be displayed here
              </div>
            </ContentSection>
          </div>
        )}
      </div>
    </MainContent>
  );
}

// Helper functions
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function generateMockActivities(history: any[]): ActivityItem[] {
  const activities: ActivityItem[] = [];
  
  // Generate activities from recent history
  history.slice(0, 5).forEach(item => {
    if (item.status === 'completed') {
      activities.push({
        id: `send-${item.id}`,
        type: 'send',
        title: `Sent to ${item.targetType}`,
        description: `${item.files?.length || 0} files sent to ${item.targetName || item.targetId}`,
        timestamp: new Date(item.completedAt || item.createdAt),
      });
    } else if (item.status === 'failed') {
      activities.push({
        id: `error-${item.id}`,
        type: 'error',
        title: `Send failed`,
        description: `Failed to send files to ${item.targetName || item.targetId}`,
        timestamp: new Date(item.createdAt),
      });
    }
  });

  // Add some mock upload activities
  activities.push({
    id: 'upload-1',
    type: 'upload',
    title: 'Files uploaded',
    description: 'Successfully uploaded 3 files',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
  });

  return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 8);
}
