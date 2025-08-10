'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './index';
import { Button } from './Button';
import { Input } from './Input';
import { Switch } from './Switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';
import { Alert, AlertDescription } from './Alert';
import { Badge } from './Badge';
import { 
  Palette, Layout, Settings, User, Bell, Keyboard, 
  Monitor, Sun, Moon, Smartphone, Download, Upload,
  Save, RotateCcw, Trash2, Plus, Edit, Eye
} from 'lucide-react';

interface UserPreferences {
  theme: {
    mode: 'light' | 'dark' | 'system';
    primaryColor: string;
    accentColor: string;
    fontSize: 'small' | 'medium' | 'large';
    borderRadius: 'none' | 'small' | 'medium' | 'large';
    compactMode: boolean;
  };
  layout: {
    sidebarCollapsed: boolean;
    showFilePreview: boolean;
    gridColumns: number;
    defaultView: 'grid' | 'list';
    showThumbnails: boolean;
    animationsEnabled: boolean;
  };
  notifications: {
    enableDesktop: boolean;
    enableSound: boolean;
    showProgress: boolean;
    notifyOnSuccess: boolean;
    notifyOnError: boolean;
    quietHours: {
      enabled: boolean;
      start: string;
      end: string;
    };
  };
  shortcuts: {
    enabled: boolean;
    customShortcuts: Record<string, string>;
  };
  advanced: {
    autoSave: boolean;
    autoRefresh: boolean;
    refreshInterval: number;
    maxFileHistory: number;
    enableDebugMode: boolean;
    enableAnalytics: boolean;
  };
}

interface ThemePreset {
  id: string;
  name: string;
  description: string;
  theme: UserPreferences['theme'];
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: {
    mode: 'system',
    primaryColor: '#3b82f6',
    accentColor: '#10b981',
    fontSize: 'medium',
    borderRadius: 'medium',
    compactMode: false
  },
  layout: {
    sidebarCollapsed: false,
    showFilePreview: true,
    gridColumns: 4,
    defaultView: 'grid',
    showThumbnails: true,
    animationsEnabled: true
  },
  notifications: {
    enableDesktop: true,
    enableSound: false,
    showProgress: true,
    notifyOnSuccess: true,
    notifyOnError: true,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00'
    }
  },
  shortcuts: {
    enabled: true,
    customShortcuts: {
      'ctrl+u': 'upload',
      'ctrl+s': 'save',
      'ctrl+r': 'refresh',
      'ctrl+d': 'delete',
      'esc': 'close'
    }
  },
  advanced: {
    autoSave: true,
    autoRefresh: false,
    refreshInterval: 30,
    maxFileHistory: 100,
    enableDebugMode: false,
    enableAnalytics: true
  }
};

const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'default',
    name: 'Default Blue',
    description: 'Clean and professional blue theme',
    theme: {
      mode: 'light',
      primaryColor: '#3b82f6',
      accentColor: '#10b981',
      fontSize: 'medium',
      borderRadius: 'medium',
      compactMode: false
    }
  },
  {
    id: 'dark',
    name: 'Dark Mode',
    description: 'Easy on the eyes dark theme',
    theme: {
      mode: 'dark',
      primaryColor: '#6366f1',
      accentColor: '#06b6d4',
      fontSize: 'medium',
      borderRadius: 'medium',
      compactMode: false
    }
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Space-efficient compact layout',
    theme: {
      mode: 'light',
      primaryColor: '#8b5cf6',
      accentColor: '#f59e0b',
      fontSize: 'small',
      borderRadius: 'small',
      compactMode: true
    }
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean minimal design',
    theme: {
      mode: 'light',
      primaryColor: '#6b7280',
      accentColor: '#374151',
      fontSize: 'medium',
      borderRadius: 'none',
      compactMode: false
    }
  }
];

export default function UserCustomization() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  // Load user preferences
  useEffect(() => {
    loadPreferences();
  }, []);

  // Track changes
  useEffect(() => {
    const hasChangesNow = JSON.stringify(preferences) !== JSON.stringify(DEFAULT_PREFERENCES);
    setHasChanges(hasChangesNow);
  }, [preferences]);

  const loadPreferences = async () => {
    try {
      const response = await fetch('/api/user/preferences');
      if (response.ok) {
        const data = await response.json();
        setPreferences({ ...DEFAULT_PREFERENCES, ...data.preferences });
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  };

  const savePreferences = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences })
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Preferences saved successfully' });
        setHasChanges(false);
        
        // Apply theme changes immediately
        applyTheme(preferences.theme);
      } else {
        throw new Error('Failed to save preferences');
      }
    } catch (error) {
      console.error('Failed to save preferences:', error);
      setMessage({ type: 'error', text: 'Failed to save preferences' });
    } finally {
      setIsLoading(false);
    }
  };

  const resetPreferences = () => {
    setPreferences(DEFAULT_PREFERENCES);
    setMessage({ type: 'success', text: 'Preferences reset to defaults' });
  };

  const exportPreferences = () => {
    const dataStr = JSON.stringify(preferences, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `whatsapp-status-handler-preferences-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importPreferences = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        setPreferences({ ...DEFAULT_PREFERENCES, ...imported });
        setMessage({ type: 'success', text: 'Preferences imported successfully' });
      } catch (error) {
        setMessage({ type: 'error', text: 'Invalid preferences file' });
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  };

  const applyTheme = (theme: UserPreferences['theme']) => {
    const root = document.documentElement;
    
    // Apply CSS variables
    root.style.setProperty('--primary-color', theme.primaryColor);
    root.style.setProperty('--accent-color', theme.accentColor);
    
    // Apply font size
    const fontSizes = { small: '14px', medium: '16px', large: '18px' };
    root.style.setProperty('--base-font-size', fontSizes[theme.fontSize]);
    
    // Apply border radius
    const borderRadii = { none: '0px', small: '4px', medium: '8px', large: '12px' };
    root.style.setProperty('--border-radius', borderRadii[theme.borderRadius]);
    
    // Apply theme mode
    if (theme.mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme.mode === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System theme
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', isDark);
    }
    
    // Apply compact mode
    document.documentElement.classList.toggle('compact', theme.compactMode);
  };

  const applyThemePreset = (preset: ThemePreset) => {
    setPreferences(prev => ({
      ...prev,
      theme: preset.theme
    }));
    
    if (previewMode) {
      applyTheme(preset.theme);
    }
  };

  const updatePreference = (path: string, value: any) => {
    setPreferences(prev => {
      const newPrefs = { ...prev };
      const keys = path.split('.');
      let current = newPrefs as any;
      
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      return newPrefs;
    });
  };

  return (
    <div className="space-y-6">
      {message && (
        <Alert className={message.type === 'error' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}>
          <AlertDescription className={message.type === 'error' ? 'text-red-800' : 'text-green-800'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Customization</h2>
          <p className="text-gray-600">Personalize your WhatsApp Status Handler experience</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Switch
            checked={previewMode}
            onCheckedChange={setPreviewMode}
          />
          <span className="text-sm">Live Preview</span>
          
          <Button variant="outline" onClick={exportPreferences}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <label className="cursor-pointer">
            <Button variant="outline" asChild>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </span>
            </Button>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={importPreferences}
            />
          </label>
        </div>
      </div>

      <Tabs defaultValue="theme" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="theme">Theme</TabsTrigger>
          <TabsTrigger value="layout">Layout</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* Theme Tab */}
        <TabsContent value="theme" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Theme Presets
                </CardTitle>
                <CardDescription>
                  Quick theme configurations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {THEME_PRESETS.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => applyThemePreset(preset)}
                  >
                    <div>
                      <h4 className="font-medium">{preset.name}</h4>
                      <p className="text-sm text-gray-600">{preset.description}</p>
                    </div>
                    <div className="flex gap-1">
                      <div 
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: preset.theme.primaryColor }}
                      />
                      <div 
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: preset.theme.accentColor }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Custom Theme</CardTitle>
                <CardDescription>
                  Customize colors and appearance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Theme Mode</label>
                  <Select
                    value={preferences.theme.mode}
                    onValueChange={(value: 'light' | 'dark' | 'system') => 
                      updatePreference('theme.mode', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">
                        <div className="flex items-center gap-2">
                          <Sun className="w-4 h-4" />
                          Light
                        </div>
                      </SelectItem>
                      <SelectItem value="dark">
                        <div className="flex items-center gap-2">
                          <Moon className="w-4 h-4" />
                          Dark
                        </div>
                      </SelectItem>
                      <SelectItem value="system">
                        <div className="flex items-center gap-2">
                          <Monitor className="w-4 h-4" />
                          System
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Primary Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={preferences.theme.primaryColor}
                      onChange={(e) => updatePreference('theme.primaryColor', e.target.value)}
                      className="w-12 h-10 border rounded"
                    />
                    <Input
                      value={preferences.theme.primaryColor}
                      onChange={(e) => updatePreference('theme.primaryColor', e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={preferences.theme.accentColor}
                      onChange={(e) => updatePreference('theme.accentColor', e.target.value)}
                      className="w-12 h-10 border rounded"
                    />
                    <Input
                      value={preferences.theme.accentColor}
                      onChange={(e) => updatePreference('theme.accentColor', e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Font Size</label>
                  <Select
                    value={preferences.theme.fontSize}
                    onValueChange={(value: 'small' | 'medium' | 'large') => 
                      updatePreference('theme.fontSize', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Border Radius</label>
                  <Select
                    value={preferences.theme.borderRadius}
                    onValueChange={(value: 'none' | 'small' | 'medium' | 'large') => 
                      updatePreference('theme.borderRadius', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium">Compact Mode</label>
                    <p className="text-sm text-gray-600">Reduce spacing and padding</p>
                  </div>
                  <Switch
                    checked={preferences.theme.compactMode}
                    onCheckedChange={(checked) => updatePreference('theme.compactMode', checked)}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Layout Tab */}
        <TabsContent value="layout" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layout className="w-5 h-5" />
                Layout Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Collapse Sidebar</label>
                      <p className="text-sm text-gray-600">Start with sidebar collapsed</p>
                    </div>
                    <Switch
                      checked={preferences.layout.sidebarCollapsed}
                      onCheckedChange={(checked) => updatePreference('layout.sidebarCollapsed', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Show File Preview</label>
                      <p className="text-sm text-gray-600">Display file previews in sidebar</p>
                    </div>
                    <Switch
                      checked={preferences.layout.showFilePreview}
                      onCheckedChange={(checked) => updatePreference('layout.showFilePreview', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Show Thumbnails</label>
                      <p className="text-sm text-gray-600">Display image thumbnails</p>
                    </div>
                    <Switch
                      checked={preferences.layout.showThumbnails}
                      onCheckedChange={(checked) => updatePreference('layout.showThumbnails', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Enable Animations</label>
                      <p className="text-sm text-gray-600">Smooth transitions and effects</p>
                    </div>
                    <Switch
                      checked={preferences.layout.animationsEnabled}
                      onCheckedChange={(checked) => updatePreference('layout.animationsEnabled', checked)}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Default View</label>
                    <Select
                      value={preferences.layout.defaultView}
                      onValueChange={(value: 'grid' | 'list') => 
                        updatePreference('layout.defaultView', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="grid">Grid View</SelectItem>
                        <SelectItem value="list">List View</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Grid Columns: {preferences.layout.gridColumns}
                    </label>
                    <input
                      type="range"
                      min="2"
                      max="8"
                      value={preferences.layout.gridColumns}
                      onChange={(e) => updatePreference('layout.gridColumns', parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>2</span>
                      <span>8</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notification Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Desktop Notifications</label>
                      <p className="text-sm text-gray-600">Show system notifications</p>
                    </div>
                    <Switch
                      checked={preferences.notifications.enableDesktop}
                      onCheckedChange={(checked) => updatePreference('notifications.enableDesktop', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Sound Notifications</label>
                      <p className="text-sm text-gray-600">Play notification sounds</p>
                    </div>
                    <Switch
                      checked={preferences.notifications.enableSound}
                      onCheckedChange={(checked) => updatePreference('notifications.enableSound', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Show Progress</label>
                      <p className="text-sm text-gray-600">Display upload progress notifications</p>
                    </div>
                    <Switch
                      checked={preferences.notifications.showProgress}
                      onCheckedChange={(checked) => updatePreference('notifications.showProgress', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Success Notifications</label>
                      <p className="text-sm text-gray-600">Notify on successful operations</p>
                    </div>
                    <Switch
                      checked={preferences.notifications.notifyOnSuccess}
                      onCheckedChange={(checked) => updatePreference('notifications.notifyOnSuccess', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Error Notifications</label>
                      <p className="text-sm text-gray-600">Notify on errors</p>
                    </div>
                    <Switch
                      checked={preferences.notifications.notifyOnError}
                      onCheckedChange={(checked) => updatePreference('notifications.notifyOnError', checked)}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Quiet Hours</label>
                      <p className="text-sm text-gray-600">Disable notifications during specified hours</p>
                    </div>
                    <Switch
                      checked={preferences.notifications.quietHours.enabled}
                      onCheckedChange={(checked) => updatePreference('notifications.quietHours.enabled', checked)}
                    />
                  </div>

                  {preferences.notifications.quietHours.enabled && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">Start Time</label>
                        <Input
                          type="time"
                          value={preferences.notifications.quietHours.start}
                          onChange={(e) => updatePreference('notifications.quietHours.start', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">End Time</label>
                        <Input
                          type="time"
                          value={preferences.notifications.quietHours.end}
                          onChange={(e) => updatePreference('notifications.quietHours.end', e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shortcuts Tab */}
        <TabsContent value="shortcuts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Keyboard className="w-5 h-5" />
                Keyboard Shortcuts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">Enable Keyboard Shortcuts</label>
                  <p className="text-sm text-gray-600">Use keyboard shortcuts for quick actions</p>
                </div>
                <Switch
                  checked={preferences.shortcuts.enabled}
                  onCheckedChange={(checked) => updatePreference('shortcuts.enabled', checked)}
                />
              </div>

              {preferences.shortcuts.enabled && (
                <div className="space-y-3">
                  <h4 className="font-medium">Custom Shortcuts</h4>
                  {Object.entries(preferences.shortcuts.customShortcuts).map(([shortcut, action]) => (
                    <div key={shortcut} className="flex items-center gap-3 p-3 border rounded-lg">
                      <Badge variant="outline" className="font-mono">
                        {shortcut}
                      </Badge>
                      <span className="flex-1">{action}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newShortcuts = { ...preferences.shortcuts.customShortcuts };
                          delete newShortcuts[shortcut];
                          updatePreference('shortcuts.customShortcuts', newShortcuts);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  
                  <Button variant="outline" className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Custom Shortcut
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Advanced Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Auto Save</label>
                      <p className="text-sm text-gray-600">Automatically save preferences</p>
                    </div>
                    <Switch
                      checked={preferences.advanced.autoSave}
                      onCheckedChange={(checked) => updatePreference('advanced.autoSave', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Auto Refresh</label>
                      <p className="text-sm text-gray-600">Automatically refresh file list</p>
                    </div>
                    <Switch
                      checked={preferences.advanced.autoRefresh}
                      onCheckedChange={(checked) => updatePreference('advanced.autoRefresh', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Enable Analytics</label>
                      <p className="text-sm text-gray-600">Collect usage analytics</p>
                    </div>
                    <Switch
                      checked={preferences.advanced.enableAnalytics}
                      onCheckedChange={(checked) => updatePreference('advanced.enableAnalytics', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-medium">Debug Mode</label>
                      <p className="text-sm text-gray-600">Enable debug logging</p>
                    </div>
                    <Switch
                      checked={preferences.advanced.enableDebugMode}
                      onCheckedChange={(checked) => updatePreference('advanced.enableDebugMode', checked)}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Refresh Interval (seconds): {preferences.advanced.refreshInterval}
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="300"
                      step="10"
                      value={preferences.advanced.refreshInterval}
                      onChange={(e) => updatePreference('advanced.refreshInterval', parseInt(e.target.value))}
                      className="w-full"
                      disabled={!preferences.advanced.autoRefresh}
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>10s</span>
                      <span>5m</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Max File History: {preferences.advanced.maxFileHistory}
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="1000"
                      step="50"
                      value={preferences.advanced.maxFileHistory}
                      onChange={(e) => updatePreference('advanced.maxFileHistory', parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>50</span>
                      <span>1000</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={resetPreferences}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset to Defaults
        </Button>
        
        <div className="flex gap-3">
          {hasChanges && (
            <Badge variant="secondary">Unsaved Changes</Badge>
          )}
          <Button onClick={savePreferences} disabled={isLoading || !hasChanges}>
            <Save className="w-4 h-4 mr-2" />
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
