'use client';

import React, { useState } from 'react';

export interface SettingsSection {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  component: React.ReactNode;
}

interface SettingsInterfaceProps {
  sections: SettingsSection[];
  activeSection?: string;
  onSectionChange?: (sectionId: string) => void;
  className?: string;
}

export const SettingsInterface: React.FC<SettingsInterfaceProps> = ({
  sections,
  activeSection,
  onSectionChange,
  className = '',
}) => {
  const [currentSection, setCurrentSection] = useState(activeSection || sections[0]?.id || '');

  const handleSectionChange = (sectionId: string) => {
    setCurrentSection(sectionId);
    onSectionChange?.(sectionId);
  };

  const currentSectionData = sections.find(s => s.id === currentSection);

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${className}`}>
      <div className="grid grid-cols-1 lg:grid-cols-4">
        {/* Sidebar */}
        <div className="lg:col-span-1 bg-gray-50 border-r border-gray-200">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Settings</h2>
            <nav className="space-y-2">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleSectionChange(section.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    currentSection === section.id
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`flex-shrink-0 ${currentSection === section.id ? 'text-blue-600' : 'text-gray-400'}`}>
                      {section.icon}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{section.title}</div>
                      <div className="text-xs text-gray-500 mt-1">{section.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <div className="p-6">
            {currentSectionData ? (
              <div>
                <div className="mb-6">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="text-blue-600">{currentSectionData.icon}</div>
                    <h3 className="text-xl font-semibold text-gray-900">{currentSectionData.title}</h3>
                  </div>
                  <p className="text-gray-600">{currentSectionData.description}</p>
                </div>
                {currentSectionData.component}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-2">
                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-gray-500">Select a settings section</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// General Settings Component
export interface GeneralSettingsProps {
  settings: {
    appName: string;
    autoConnect: boolean;
    notificationsEnabled: boolean;
    darkMode: boolean;
    language: string;
    timezone: string;
    maxFileSize: number;
    maxConcurrentUploads: number;
  };
  onSettingsChange: (settings: any) => void;
  onSave: () => void;
  saving?: boolean;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  settings,
  onSettingsChange,
  onSave,
  saving = false,
}) => {
  const updateSetting = (key: string, value: any) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6">
      {/* Application Settings */}
      <div>
        <h4 className="text-lg font-medium text-gray-900 mb-4">Application</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Application Name
            </label>
            <input
              type="text"
              value={settings.appName}
              onChange={(e) => updateSetting('appName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Language
            </label>
            <select
              value={settings.language}
              onChange={(e) => updateSetting('language', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Timezone
            </label>
            <select
              value={settings.timezone}
              onChange={(e) => updateSetting('timezone', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time</option>
              <option value="America/Chicago">Central Time</option>
              <option value="America/Denver">Mountain Time</option>
              <option value="America/Los_Angeles">Pacific Time</option>
              <option value="Europe/London">London</option>
              <option value="Europe/Paris">Paris</option>
              <option value="Asia/Tokyo">Tokyo</option>
            </select>
          </div>
        </div>
      </div>

      {/* Performance Settings */}
      <div>
        <h4 className="text-lg font-medium text-gray-900 mb-4">Performance</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Maximum File Size (MB)
            </label>
            <input
              type="number"
              min="1"
              max="2048"
              value={settings.maxFileSize}
              onChange={(e) => updateSetting('maxFileSize', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum size for individual files</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Concurrent Uploads
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={settings.maxConcurrentUploads}
              onChange={(e) => updateSetting('maxConcurrentUploads', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Number of files to upload simultaneously</p>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div>
        <h4 className="text-lg font-medium text-gray-900 mb-4">Preferences</h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">Auto Connect</label>
              <p className="text-xs text-gray-500">Automatically connect to WhatsApp on startup</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoConnect}
                onChange={(e) => updateSetting('autoConnect', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">Notifications</label>
              <p className="text-xs text-gray-500">Show desktop notifications for send status</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notificationsEnabled}
                onChange={(e) => updateSetting('notificationsEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">Dark Mode</label>
              <p className="text-xs text-gray-500">Use dark theme for the interface</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.darkMode}
                onChange={(e) => updateSetting('darkMode', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

// Data Management Component
export interface DataManagementProps {
  onExportData: (dataType: 'all' | 'settings' | 'history' | 'contacts') => void;
  onImportData: (file: File) => void;
  onClearData: (dataType: 'all' | 'history' | 'temp' | 'cache') => void;
  exportInProgress?: boolean;
  importInProgress?: boolean;
  clearInProgress?: boolean;
}

export const DataManagement: React.FC<DataManagementProps> = ({
  onExportData,
  onImportData,
  onClearData,
  exportInProgress = false,
  importInProgress = false,
  clearInProgress = false,
}) => {
  const [importFile, setImportFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
    }
  };

  const handleImport = () => {
    if (importFile) {
      onImportData(importFile);
      setImportFile(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Export Data */}
      <div>
        <h4 className="text-lg font-medium text-gray-900 mb-4">Export Data</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => onExportData('all')}
            disabled={exportInProgress}
            className="p-4 border border-gray-300 rounded-lg text-left hover:bg-gray-50 disabled:opacity-50"
          >
            <div className="font-medium text-gray-900">All Data</div>
            <div className="text-sm text-gray-600">Export everything including settings, history, and contacts</div>
          </button>

          <button
            onClick={() => onExportData('settings')}
            disabled={exportInProgress}
            className="p-4 border border-gray-300 rounded-lg text-left hover:bg-gray-50 disabled:opacity-50"
          >
            <div className="font-medium text-gray-900">Settings Only</div>
            <div className="text-sm text-gray-600">Export application settings and configuration</div>
          </button>

          <button
            onClick={() => onExportData('history')}
            disabled={exportInProgress}
            className="p-4 border border-gray-300 rounded-lg text-left hover:bg-gray-50 disabled:opacity-50"
          >
            <div className="font-medium text-gray-900">Send History</div>
            <div className="text-sm text-gray-600">Export send history and logs</div>
          </button>

          <button
            onClick={() => onExportData('contacts')}
            disabled={exportInProgress}
            className="p-4 border border-gray-300 rounded-lg text-left hover:bg-gray-50 disabled:opacity-50"
          >
            <div className="font-medium text-gray-900">Contacts & Groups</div>
            <div className="text-sm text-gray-600">Export contacts, groups, and broadcast lists</div>
          </button>
        </div>
      </div>

      {/* Import Data */}
      <div>
        <h4 className="text-lg font-medium text-gray-900 mb-4">Import Data</h4>
        <div className="border border-dashed border-gray-300 rounded-lg p-6">
          <div className="text-center">
            <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 12l2 2 4-4" />
            </svg>
            <div className="text-sm text-gray-600 mb-4">
              Select a backup file to import your data
            </div>
            <input
              type="file"
              accept=".json,.zip"
              onChange={handleFileChange}
              className="mb-4"
            />
            {importFile && (
              <div className="text-sm text-gray-700 mb-2">
                Selected: {importFile.name}
              </div>
            )}
            <button
              onClick={handleImport}
              disabled={!importFile || importInProgress}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importInProgress ? 'Importing...' : 'Import Data'}
            </button>
          </div>
        </div>
      </div>

      {/* Clear Data */}
      <div>
        <h4 className="text-lg font-medium text-gray-900 mb-4">Clear Data</h4>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="flex">
            <svg className="w-5 h-5 text-yellow-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="text-sm text-yellow-700">
              <strong>Warning:</strong> These actions cannot be undone. Make sure to export your data first.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => onClearData('temp')}
            disabled={clearInProgress}
            className="p-4 border border-gray-300 rounded-lg text-left hover:bg-gray-50 disabled:opacity-50"
          >
            <div className="font-medium text-gray-900">Clear Temporary Files</div>
            <div className="text-sm text-gray-600">Remove uploaded files and cache</div>
          </button>

          <button
            onClick={() => onClearData('history')}
            disabled={clearInProgress}
            className="p-4 border border-yellow-300 rounded-lg text-left hover:bg-yellow-50 disabled:opacity-50"
          >
            <div className="font-medium text-yellow-800">Clear Send History</div>
            <div className="text-sm text-yellow-600">Remove all send logs and history</div>
          </button>

          <button
            onClick={() => onClearData('cache')}
            disabled={clearInProgress}
            className="p-4 border border-gray-300 rounded-lg text-left hover:bg-gray-50 disabled:opacity-50"
          >
            <div className="font-medium text-gray-900">Clear Cache</div>
            <div className="text-sm text-gray-600">Clear application cache and temporary data</div>
          </button>

          <button
            onClick={() => onClearData('all')}
            disabled={clearInProgress}
            className="p-4 border border-red-300 rounded-lg text-left hover:bg-red-50 disabled:opacity-50"
          >
            <div className="font-medium text-red-800">Clear All Data</div>
            <div className="text-sm text-red-600">Reset application to factory state</div>
          </button>
        </div>
      </div>
    </div>
  );
};

// Session Management Component
export interface SessionInfo {
  id: string;
  deviceName: string;
  createdAt: Date;
  lastSeenAt: Date;
  isActive: boolean;
}

export interface SessionManagementProps {
  sessions: SessionInfo[];
  currentSessionId?: string;
  onDisconnect: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onCreateBackup: (sessionId: string) => void;
  loading?: boolean;
}

export const SessionManagement: React.FC<SessionManagementProps> = ({
  sessions,
  currentSessionId,
  onDisconnect,
  onDeleteSession,
  onCreateBackup,
  loading = false,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-lg font-medium text-gray-900 mb-4">WhatsApp Sessions</h4>
        <p className="text-sm text-gray-600 mb-6">
          Manage your WhatsApp connection sessions. You can have multiple saved sessions but only one active at a time.
        </p>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
                <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-500">No saved sessions</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h5 className="font-medium text-gray-900">{session.deviceName}</h5>
                        {session.isActive && (
                          <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                            Active
                          </span>
                        )}
                        {session.id === currentSessionId && (
                          <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        <div>Created: {session.createdAt.toLocaleDateString()}</div>
                        <div>Last seen: {session.lastSeenAt.toLocaleDateString()}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onCreateBackup(session.id)}
                        className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        Backup
                      </button>
                      
                      {session.isActive && (
                        <button
                          onClick={() => onDisconnect(session.id)}
                          className="px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                        >
                          Disconnect
                        </button>
                      )}
                      
                      <button
                        onClick={() => onDeleteSession(session.id)}
                        className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Session Actions */}
      <div>
        <h4 className="text-lg font-medium text-gray-900 mb-4">Session Actions</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button className="p-4 border border-gray-300 rounded-lg text-left hover:bg-gray-50">
            <div className="font-medium text-gray-900">New Session</div>
            <div className="text-sm text-gray-600">Create a new WhatsApp connection</div>
          </button>
          
          <button className="p-4 border border-gray-300 rounded-lg text-left hover:bg-gray-50">
            <div className="font-medium text-gray-900">Import Session</div>
            <div className="text-sm text-gray-600">Import session from backup file</div>
          </button>
        </div>
      </div>
    </div>
  );
};
