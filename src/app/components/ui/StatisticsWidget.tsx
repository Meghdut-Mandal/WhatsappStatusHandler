'use client';

import React from 'react';
import { formatDistanceToNow } from 'date-fns';

export interface StatisticItem {
  label: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease' | 'neutral';
    period: string;
  };
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
}

interface StatisticsWidgetProps {
  title: string;
  statistics: StatisticItem[];
  loading?: boolean;
  className?: string;
}

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600 border-blue-200',
  green: 'bg-green-50 text-green-600 border-green-200',
  yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  red: 'bg-red-50 text-red-600 border-red-200',
  purple: 'bg-purple-50 text-purple-600 border-purple-200',
  gray: 'bg-gray-50 text-gray-600 border-gray-200',
};

const changeColorClasses = {
  increase: 'text-green-600',
  decrease: 'text-red-600',
  neutral: 'text-gray-600',
};

export const StatisticsWidget: React.FC<StatisticsWidgetProps> = ({
  title,
  statistics,
  loading = false,
  className = '',
}) => {
  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="grid grid-cols-1 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-6 bg-gray-200 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      
      <div className="space-y-4">
        {statistics.map((stat, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {stat.icon && (
                <div className={`p-2 rounded-lg border ${colorClasses[stat.color || 'gray']}`}>
                  {stat.icon}
                </div>
              )}
              <span className="text-sm font-medium text-gray-600">{stat.label}</span>
            </div>
            
            <div className="text-right">
              <div className="text-2xl font-semibold text-gray-900">
                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
              </div>
              
              {stat.change && (
                <div className={`text-xs ${changeColorClasses[stat.change.type]} flex items-center justify-end`}>
                  {stat.change.type === 'increase' && (
                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17l9.2-9.2M17 17V7H7" />
                    </svg>
                  )}
                  {stat.change.type === 'decrease' && (
                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7l-9.2 9.2M7 7v10h10" />
                    </svg>
                  )}
                  {Math.abs(stat.change.value)}% {stat.change.period}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export interface ActivityItem {
  id: string;
  type: 'upload' | 'send' | 'connection' | 'error';
  title: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface ActivityOverviewProps {
  activities: ActivityItem[];
  loading?: boolean;
  className?: string;
}

const activityIcons = {
  upload: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  ),
  send: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  ),
  connection: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const activityColors = {
  upload: 'text-blue-600 bg-blue-50',
  send: 'text-green-600 bg-green-50',
  connection: 'text-purple-600 bg-purple-50',
  error: 'text-red-600 bg-red-50',
};

export const ActivityOverview: React.FC<ActivityOverviewProps> = ({
  activities,
  loading = false,
  className = '',
}) => {
  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
                <div className="h-3 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
        <button className="text-sm text-blue-600 hover:text-blue-800">
          View All
        </button>
      </div>
      
      <div className="space-y-3">
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">No recent activity</p>
          </div>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="flex items-start space-x-3 py-2">
              <div className={`p-2 rounded-full ${activityColors[activity.type]}`}>
                {activityIcons[activity.type]}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {activity.title}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  {activity.description}
                </p>
              </div>
              
              <div className="text-xs text-gray-400 whitespace-nowrap">
                {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
