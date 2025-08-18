'use client';

import React, { useState, useEffect } from 'react';
import { MainContent } from '../../components/layout/MainContent';
import { 
  SettingsInterface, 
  GeneralSettings, 
  DataManagement, 
  SessionManagement,
  type SettingsSection, 
  type SessionInfo 
} from '../../components/ui';

interface AppSettings {
  general: {
    appName: string;
    autoConnect: boolean;
    notificationsEnabled: boolean;
    darkMode: boolean;
    language: string;
    timezone: string;
    maxFileSize: number;
    maxConcurrentUploads: number;
  };
  upload: {
    defaultSendAsDocument: boolean;
    enableCompression: boolean;
    compressionLevel: number;
    maxRetries: number;
    chunkSize: number;
    bandwidthLimit?: number;
  };
  whatsapp: {
    statusUpdateInterval: number;
    autoReconnect: boolean;
    maxReconnectAttempts: number;
    keepAlive: boolean;
    markOnlineOnConnect: boolean;
  };
  privacy: {
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    clearLogsAfterDays: number;
    clearHistoryAfterDays: number;
    clearTempFilesAfterHours: number;
  };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportInProgress, setExportInProgress] = useState(false);
  const [importInProgress, setImportInProgress] = useState(false);
  const [clearInProgress, setClearInProgress] = useState(false);

  useEffect(() => {
    loadSettings();
    loadSessions();
    loadCurrentSession();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadSessions = async () => {
    try {
      setSessionError(null);
      
      // Get all sessions
      const response = await fetch('/api/session/info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'get_all' }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.sessions) {
        // Convert date strings to Date objects
        const sessionsWithDates: SessionInfo[] = data.sessions.map((session: {
          id: string;
          deviceName: string;
          createdAt: string;
          lastSeenAt: string;
          isActive: boolean;
        }) => ({
          ...session,
          createdAt: new Date(session.createdAt),
          lastSeenAt: new Date(session.lastSeenAt),
        }));
        setSessions(sessionsWithDates);
      } else {
        throw new Error(data.error || 'Failed to load sessions');
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setSessionError(error instanceof Error ? error.message : 'Failed to load sessions');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentSession = async () => {
    try {
      // Get current active session with connection status
      const response = await fetch('/api/session/info?includeStats=true');
      
      if (!response.ok) {
        // Don't set error for current session loading as it's not critical
        setCurrentSessionId(null);
        return;
      }
      
      const data = await response.json();
      
      if (data.success && data.session) {
        setCurrentSessionId(data.session.id);
        
        // Update the session in our sessions array with additional info
        setSessions(prevSessions => 
          prevSessions.map(session => 
            session.id === data.session.id 
              ? {
                  ...session,
                  connectionStatus: data.session.connectionStatus,
                  whatsappUser: data.session.whatsappUser,
                }
              : session
          )
        );
      } else {
        setCurrentSessionId(null);
      }
    } catch (error) {
      console.error('Failed to load current session:', error);
      setCurrentSessionId(null);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      
      const data = await response.json();
      if (data.success) {
        // Settings saved successfully
        console.log('Settings saved successfully');
      } else {
        console.error('Failed to save settings:', data.error);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async (dataType: 'all' | 'settings' | 'history' | 'contacts') => {
    try {
      setExportInProgress(true);
      const response = await fetch(`/api/data?type=${dataType}&format=zip`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `whatsapp_export_${dataType}_${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExportInProgress(false);
    }
  };

  const handleImportData = async (file: File) => {
    try {
      setImportInProgress(true);
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/data', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      if (data.success) {
        console.log('Data imported successfully:', data.results);
        // Reload settings and sessions
        await loadSettings();
        await loadSessions();
      } else {
        console.error('Import failed:', data.error);
      }
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setImportInProgress(false);
    }
  };

  const handleClearData = async (dataType: 'all' | 'history' | 'temp' | 'cache') => {
    try {
      setClearInProgress(true);
      const response = await fetch(`/api/data?type=${dataType}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      if (data.success) {
        console.log('Data cleared successfully:', data.results);
      } else {
        console.error('Clear failed:', data.error);
      }
    } catch (error) {
      console.error('Clear failed:', error);
    } finally {
      setClearInProgress(false);
    }
  };

  const handleDisconnectSession = async (sessionId: string) => {
    try {
      // Mock disconnect - in real app would call API
      setSessions(prev => prev.map(session => 
        session.id === sessionId 
          ? { ...session, isActive: false }
          : session
      ));
    } catch (error) {
      console.error('Disconnect failed:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      // Mock delete - in real app would call API
      setSessions(prev => prev.filter(session => session.id !== sessionId));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleCreateBackup = async (sessionId: string) => {
    try {
      // Mock backup creation - in real app would call API
      console.log('Creating backup for session:', sessionId);
    } catch (error) {
      console.error('Backup failed:', error);
    }
  };

  const handleRefreshSessions = async () => {
    setLoading(true);
    await Promise.all([loadSessions(), loadCurrentSession()]);
  };

  if (loading || !settings) {
    return (
      <MainContent 
        title="Settings" 
        subtitle="Configure your WhatsApp Status Handler"
      >
        <div className="animate-pulse">Loading settings...</div>
      </MainContent>
    );
  }

  // Define settings sections
  const settingsSections: SettingsSection[] = [
    {
      id: 'general',
      title: 'General',
      description: 'App preferences and basic settings',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      component: (
        <GeneralSettings
          settings={settings.general}
          onSettingsChange={(newSettings) => setSettings(prev => prev ? { ...prev, general: newSettings } : null)}
          onSave={handleSaveSettings}
          saving={saving}
        />
      ),
    },
    {
      id: 'upload',
      title: 'Upload & Processing',
      description: 'File upload and processing preferences',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      ),
      component: (
        <div className="space-y-6">
          <div>
            <h4 className="text-lg font-medium text-gray-900 mb-4">Upload Settings</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">Send as Document by Default</label>
                  <p className="text-xs text-gray-500">Files will be sent as documents instead of media</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.upload.defaultSendAsDocument}
                    onChange={(e) => setSettings(prev => prev ? {
                      ...prev,
                      upload: { ...prev.upload, defaultSendAsDocument: e.target.checked }
                    } : null)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">Enable Compression</label>
                  <p className="text-xs text-gray-500">Compress files before sending</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.upload.enableCompression}
                    onChange={(e) => setSettings(prev => prev ? {
                      ...prev,
                      upload: { ...prev.upload, enableCompression: e.target.checked }
                    } : null)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Compression Level
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={settings.upload.compressionLevel}
                  onChange={(e) => setSettings(prev => prev ? {
                    ...prev,
                    upload: { ...prev.upload, compressionLevel: parseInt(e.target.value) }
                  } : null)}
                  className="w-full"
                  disabled={!settings.upload.enableCompression}
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Faster</span>
                  <span>{settings.upload.compressionLevel}</span>
                  <span>Smaller</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chunk Size (MB)
                </label>
                <input
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={settings.upload.chunkSize}
                  onChange={(e) => setSettings(prev => prev ? {
                    ...prev,
                    upload: { ...prev.upload, chunkSize: parseFloat(e.target.value) }
                  } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      ),
    },
    {
      id: 'whatsapp',
      title: 'WhatsApp',
      description: 'WhatsApp connection and behavior settings',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      component: (
        <div className="space-y-6">
          <div>
            <h4 className="text-lg font-medium text-gray-900 mb-4">Connection Settings</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">Auto Reconnect</label>
                  <p className="text-xs text-gray-500">Automatically reconnect when connection is lost</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.whatsapp.autoReconnect}
                    onChange={(e) => setSettings(prev => prev ? {
                      ...prev,
                      whatsapp: { ...prev.whatsapp, autoReconnect: e.target.checked }
                    } : null)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Reconnect Attempts
                </label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={settings.whatsapp.maxReconnectAttempts}
                  onChange={(e) => setSettings(prev => prev ? {
                    ...prev,
                    whatsapp: { ...prev.whatsapp, maxReconnectAttempts: parseInt(e.target.value) }
                  } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!settings.whatsapp.autoReconnect}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status Update Interval (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={settings.whatsapp.statusUpdateInterval}
                  onChange={(e) => setSettings(prev => prev ? {
                    ...prev,
                    whatsapp: { ...prev.whatsapp, statusUpdateInterval: parseInt(e.target.value) }
                  } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      ),
    },
    {
      id: 'data',
      title: 'Data Management',
      description: 'Export, import, and clear your data',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
      ),
      component: (
        <DataManagement
          onExportData={handleExportData}
          onImportData={handleImportData}
          onClearData={handleClearData}
          exportInProgress={exportInProgress}
          importInProgress={importInProgress}
          clearInProgress={clearInProgress}
        />
      ),
    },
    {
      id: 'sessions',
      title: 'Sessions',
      description: 'Manage your WhatsApp connections',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
        </svg>
      ),
      component: (
        <SessionManagement
          sessions={sessions}
          currentSessionId={currentSessionId || undefined}
          onDisconnect={handleDisconnectSession}
          onDeleteSession={handleDeleteSession}
          onCreateBackup={handleCreateBackup}
          onRefresh={handleRefreshSessions}
          loading={loading}
          error={sessionError}
        />
      ),
    },
  ];

  return (
    <MainContent 
      title="Settings" 
      subtitle="Configure your WhatsApp Status Handler"
    >
      <SettingsInterface sections={settingsSections} />
    </MainContent>
  );
}
