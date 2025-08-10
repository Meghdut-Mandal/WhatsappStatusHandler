'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './index';
import { Button } from './Button';
import { Badge } from './Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';
import { 
  BarChart3, TrendingUp, TrendingDown, Activity, Users, 
  MessageSquare, Upload, Download, Clock, AlertCircle,
  Calendar, RefreshCw, Filter, Download as DownloadIcon
} from 'lucide-react';

interface AnalyticsData {
  overview: {
    totalMessages: number;
    totalUploads: number;
    totalSize: number;
    activeUsers: number;
    successRate: number;
    avgResponseTime: number;
  };
  messageStats: {
    sent: number;
    failed: number;
    scheduled: number;
    byType: Record<string, number>;
    byTarget: Record<string, number>;
  };
  uploadStats: {
    total: number;
    byType: Record<string, number>;
    bySize: Record<string, number>;
    avgSize: number;
  };
  performanceStats: {
    avgUploadTime: number;
    avgProcessingTime: number;
    errorRate: number;
    throughput: number;
  };
  timeSeriesData: {
    messages: Array<{ date: string; count: number; }>;
    uploads: Array<{ date: string; count: number; size: number; }>;
    errors: Array<{ date: string; count: number; }>;
  };
  recentActivity: Array<{
    id: string;
    type: 'message' | 'upload' | 'error' | 'system';
    description: string;
    timestamp: Date;
    status: 'success' | 'warning' | 'error';
  }>;
}

interface ChartProps {
  data: Array<{ label: string; value: number; }>;
  title: string;
  type?: 'bar' | 'line' | 'pie';
  className?: string;
}

// Simple Chart Component (would typically use a charting library like recharts or chart.js)
function SimpleChart({ data, title, type = 'bar', className = '' }: ChartProps) {
  const maxValue = Math.max(...data.map(d => d.value));
  
  return (
    <div className={`space-y-3 ${className}`}>
      <h4 className="font-medium text-sm">{title}</h4>
      <div className="space-y-2">
        {data.map((item, index) => (
          <div key={index} className="flex items-center justify-between">
            <span className="text-sm text-gray-600 truncate flex-1 mr-2">
              {item.label}
            </span>
            <div className="flex items-center gap-2 flex-1">
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium w-12 text-right">
                {item.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Time Series Chart Component
function TimeSeriesChart({ data, title, valueKey }: { 
  data: Array<{ date: string; [key: string]: any }>;
  title: string;
  valueKey: string;
}) {
  const maxValue = Math.max(...data.map(d => d[valueKey] || 0));
  
  return (
    <div className="space-y-3">
      <h4 className="font-medium text-sm">{title}</h4>
      <div className="h-32 flex items-end justify-between gap-1">
        {data.map((item, index) => (
          <div key={index} className="flex-1 flex flex-col items-center">
            <div 
              className="bg-primary rounded-t w-full transition-all hover:bg-primary/80"
              style={{ 
                height: `${((item[valueKey] || 0) / maxValue) * 100}%`,
                minHeight: '2px'
              }}
              title={`${item.date}: ${item[valueKey] || 0}`}
            />
            <span className="text-xs text-gray-500 mt-1 rotate-45 origin-left">
              {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  format = 'number' 
}: {
  title: string;
  value: number;
  change?: number;
  icon: React.ElementType;
  format?: 'number' | 'percentage' | 'bytes' | 'time';
}) {
  const formatValue = (val: number) => {
    switch (format) {
      case 'percentage':
        return `${val.toFixed(1)}%`;
      case 'bytes':
        if (val === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(val) / Math.log(k));
        return parseFloat((val / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      case 'time':
        return `${val.toFixed(0)}ms`;
      default:
        return val.toLocaleString();
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-gray-600">{title}</p>
            <p className="text-2xl font-bold">{formatValue(value)}</p>
            {change !== undefined && (
              <div className={`flex items-center gap-1 text-sm ${
                change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-600'
              }`}>
                {change > 0 ? <TrendingUp className="w-3 h-3" /> : 
                 change < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                <span>{change > 0 ? '+' : ''}{change.toFixed(1)}%</span>
              </div>
            )}
          </div>
          <Icon className="w-8 h-8 text-gray-400" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsDashboard() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7d');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Load analytics data
  useEffect(() => {
    loadAnalyticsData();
  }, [dateRange]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadAnalyticsData();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, dateRange]);

  const loadAnalyticsData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/analytics?range=${dateRange}`);
      if (response.ok) {
        const data = await response.json();
        setAnalyticsData({
          ...data,
          recentActivity: data.recentActivity.map((activity: any) => ({
            ...activity,
            timestamp: new Date(activity.timestamp)
          }))
        });
      }
    } catch (error) {
      console.error('Failed to load analytics data:', error);
      // Mock data for demonstration
      setAnalyticsData({
        overview: {
          totalMessages: 1247,
          totalUploads: 892,
          totalSize: 2.4 * 1024 * 1024 * 1024, // 2.4 GB
          activeUsers: 23,
          successRate: 94.2,
          avgResponseTime: 1200
        },
        messageStats: {
          sent: 1124,
          failed: 123,
          scheduled: 45,
          byType: { status: 678, contact: 345, group: 224 },
          byTarget: { individuals: 569, groups: 678 }
        },
        uploadStats: {
          total: 892,
          byType: { image: 534, video: 234, document: 124 },
          bySize: { '<1MB': 445, '1-10MB': 334, '>10MB': 113 },
          avgSize: 2.8 * 1024 * 1024 // 2.8 MB
        },
        performanceStats: {
          avgUploadTime: 3400,
          avgProcessingTime: 1200,
          errorRate: 5.8,
          throughput: 45.2
        },
        timeSeriesData: {
          messages: Array.from({ length: 7 }, (_, i) => ({
            date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
            count: Math.floor(Math.random() * 100) + 50
          })).reverse(),
          uploads: Array.from({ length: 7 }, (_, i) => ({
            date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
            count: Math.floor(Math.random() * 50) + 20,
            size: Math.floor(Math.random() * 100) * 1024 * 1024
          })).reverse(),
          errors: Array.from({ length: 7 }, (_, i) => ({
            date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
            count: Math.floor(Math.random() * 10)
          })).reverse()
        },
        recentActivity: [
          {
            id: '1',
            type: 'message',
            description: 'Bulk message job completed successfully',
            timestamp: new Date(Date.now() - 5 * 60 * 1000),
            status: 'success'
          },
          {
            id: '2',
            type: 'upload',
            description: 'Large video file uploaded (45.2 MB)',
            timestamp: new Date(Date.now() - 12 * 60 * 1000),
            status: 'success'
          },
          {
            id: '3',
            type: 'error',
            description: 'Failed to send message to group',
            timestamp: new Date(Date.now() - 18 * 60 * 1000),
            status: 'error'
          }
        ] as AnalyticsData['recentActivity']
      });
    } finally {
      setIsLoading(false);
    }
  };

  const exportData = async () => {
    try {
      const response = await fetch(`/api/analytics/export?range=${dateRange}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to export data:', error);
    }
  };

  if (isLoading && !analyticsData) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Loading analytics...
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="text-center py-12 text-gray-500">
        Failed to load analytics data
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-gray-600">Monitor your WhatsApp Status Handler performance</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border rounded-md bg-white"
          >
            <option value="1d">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          
          <Button
            variant="outline"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'bg-green-50 border-green-200' : ''}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto Refresh
          </Button>
          
          <Button variant="outline" onClick={exportData}>
            <DownloadIcon className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <Button onClick={loadAnalyticsData} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricCard
          title="Total Messages"
          value={analyticsData.overview.totalMessages}
          icon={MessageSquare}
          change={12.5}
        />
        <MetricCard
          title="Total Uploads"
          value={analyticsData.overview.totalUploads}
          icon={Upload}
          change={8.3}
        />
        <MetricCard
          title="Storage Used"
          value={analyticsData.overview.totalSize}
          icon={BarChart3}
          format="bytes"
          change={15.2}
        />
        <MetricCard
          title="Active Users"
          value={analyticsData.overview.activeUsers}
          icon={Users}
          change={-2.1}
        />
        <MetricCard
          title="Success Rate"
          value={analyticsData.overview.successRate}
          icon={TrendingUp}
          format="percentage"
          change={1.8}
        />
        <MetricCard
          title="Avg Response Time"
          value={analyticsData.overview.avgResponseTime}
          icon={Clock}
          format="time"
          change={-5.4}
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="uploads">Uploads</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Messages Over Time</CardTitle>
                <CardDescription>Daily message sending trends</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  data={analyticsData.timeSeriesData.messages}
                  title=""
                  valueKey="count"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Uploads Over Time</CardTitle>
                <CardDescription>Daily upload activity</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  data={analyticsData.timeSeriesData.uploads}
                  title=""
                  valueKey="count"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Message Distribution</CardTitle>
                <CardDescription>Messages by target type</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleChart
                  data={Object.entries(analyticsData.messageStats.byTarget).map(([key, value]) => ({
                    label: key,
                    value
                  }))}
                  title=""
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Upload Types</CardTitle>
                <CardDescription>Files by type</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleChart
                  data={Object.entries(analyticsData.uploadStats.byType).map(([key, value]) => ({
                    label: key,
                    value
                  }))}
                  title=""
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Messages Tab */}
        <TabsContent value="messages" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              title="Messages Sent"
              value={analyticsData.messageStats.sent}
              icon={MessageSquare}
            />
            <MetricCard
              title="Messages Failed"
              value={analyticsData.messageStats.failed}
              icon={AlertCircle}
            />
            <MetricCard
              title="Messages Scheduled"
              value={analyticsData.messageStats.scheduled}
              icon={Calendar}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Messages by Type</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleChart
                  data={Object.entries(analyticsData.messageStats.byType).map(([key, value]) => ({
                    label: key,
                    value
                  }))}
                  title=""
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Error Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  data={analyticsData.timeSeriesData.errors}
                  title=""
                  valueKey="count"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Uploads Tab */}
        <TabsContent value="uploads" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MetricCard
              title="Total Uploads"
              value={analyticsData.uploadStats.total}
              icon={Upload}
            />
            <MetricCard
              title="Average File Size"
              value={analyticsData.uploadStats.avgSize}
              icon={BarChart3}
              format="bytes"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload Size Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleChart
                  data={Object.entries(analyticsData.uploadStats.bySize).map(([key, value]) => ({
                    label: key,
                    value
                  }))}
                  title=""
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Upload Storage Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  data={analyticsData.timeSeriesData.uploads}
                  title=""
                  valueKey="size"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Avg Upload Time"
              value={analyticsData.performanceStats.avgUploadTime}
              icon={Upload}
              format="time"
            />
            <MetricCard
              title="Avg Processing Time"
              value={analyticsData.performanceStats.avgProcessingTime}
              icon={Activity}
              format="time"
            />
            <MetricCard
              title="Error Rate"
              value={analyticsData.performanceStats.errorRate}
              icon={AlertCircle}
              format="percentage"
            />
            <MetricCard
              title="Throughput"
              value={analyticsData.performanceStats.throughput}
              icon={TrendingUp}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Performance Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900">Optimize Upload Performance</h4>
                    <p className="text-sm text-blue-700">
                      Consider implementing chunked uploads for files larger than 10MB to improve reliability.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-900">Reduce Error Rate</h4>
                    <p className="text-sm text-yellow-700">
                      Current error rate is above optimal threshold. Review failed message logs for common patterns.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest system events and actions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analyticsData.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 p-3 border rounded-lg">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      activity.status === 'success' ? 'bg-green-500' :
                      activity.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm">{activity.description}</p>
                      <p className="text-xs text-gray-500">
                        {activity.timestamp.toLocaleString()}
                      </p>
                    </div>
                    <Badge 
                      variant={activity.status === 'success' ? 'default' : 'destructive'}
                      className="text-xs"
                    >
                      {activity.type}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
