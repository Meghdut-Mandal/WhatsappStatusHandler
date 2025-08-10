'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './index';
import { Button } from './Button';
import { Switch } from '@/app/components/ui/Switch';
import { Input } from '@/app/components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/Tabs';
import { Alert, AlertDescription } from '@/app/components/ui/Alert';
import { Badge } from '@/app/components/ui/Badge';
import { Shield, Key, FileText, Activity, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface SecurityConfig {
  enableLogging: boolean;
  enableIntrustionDetection: boolean;
  logRetentionDays: number;
  maxFailedAttempts: number;
  lockoutDurationMinutes: number;
  enableFileIntegrityMonitoring: boolean;
  alertOnCriticalEvents: boolean;
}

interface EncryptionConfig {
  algorithm: string;
  keyDerivation: 'scrypt' | 'pbkdf2';
  iterations?: number;
  saltLength: number;
  ivLength: number;
  tagLength: number;
  keyLength: number;
}

interface SecurityEvent {
  id: string;
  type: 'authentication' | 'file_access' | 'encryption' | 'intrusion' | 'configuration';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  source: string;
  description: string;
  metadata?: Record<string, any>;
}

interface SecurityHealth {
  status: 'healthy' | 'warning' | 'critical';
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warning';
    message: string;
  }>;
}

export default function SecuritySettings() {
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>({
    enableLogging: true,
    enableIntrustionDetection: true,
    logRetentionDays: 30,
    maxFailedAttempts: 5,
    lockoutDurationMinutes: 15,
    enableFileIntegrityMonitoring: true,
    alertOnCriticalEvents: true
  });

  const [encryptionConfig, setEncryptionConfig] = useState<EncryptionConfig>({
    algorithm: 'aes-256-gcm',
    keyDerivation: 'scrypt',
    iterations: 100000,
    saltLength: 16,
    ivLength: 16,
    tagLength: 16,
    keyLength: 32
  });

  const [securityHealth, setSecurityHealth] = useState<SecurityHealth | null>(null);
  const [recentEvents, setRecentEvents] = useState<SecurityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load initial data
  useEffect(() => {
    loadSecurityData();
  }, []);

  const loadSecurityData = async () => {
    try {
      setIsLoading(true);
      
      // Load security configuration
      const configResponse = await fetch('/api/security/config');
      if (configResponse.ok) {
        const config = await configResponse.json();
        setSecurityConfig(config.security);
        setEncryptionConfig(config.encryption);
      }

      // Load security health
      const healthResponse = await fetch('/api/security/health');
      if (healthResponse.ok) {
        const health = await healthResponse.json();
        setSecurityHealth(health);
      }

      // Load recent events
      const eventsResponse = await fetch('/api/security/events?hours=24');
      if (eventsResponse.ok) {
        const events = await eventsResponse.json();
        setRecentEvents(events.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp)
        })));
      }

    } catch (error) {
      console.error('Failed to load security data:', error);
      setMessage({ type: 'error', text: 'Failed to load security data' });
    } finally {
      setIsLoading(false);
    }
  };

  const saveSecurityConfig = async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/security/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          security: securityConfig,
          encryption: encryptionConfig
        })
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Security configuration saved successfully' });
        await loadSecurityData(); // Reload to get updated health status
      } else {
        throw new Error('Failed to save configuration');
      }

    } catch (error) {
      console.error('Failed to save security config:', error);
      setMessage({ type: 'error', text: 'Failed to save security configuration' });
    } finally {
      setIsLoading(false);
    }
  };

  const generateNewEncryptionKey = async () => {
    try {
      const response = await fetch('/api/security/generate-key', { method: 'POST' });
      if (response.ok) {
        const { key } = await response.json();
        setMessage({ 
          type: 'success', 
          text: `New encryption key generated: ${key.substring(0, 16)}...` 
        });
      }
    } catch (error) {
      console.error('Failed to generate encryption key:', error);
      setMessage({ type: 'error', text: 'Failed to generate encryption key' });
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'fail': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default: return null;
    }
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

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="encryption">Encryption</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* Security Overview */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Security Health
              </CardTitle>
              <CardDescription>
                Overall security status and health checks
              </CardDescription>
            </CardHeader>
            <CardContent>
              {securityHealth ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={securityHealth.status === 'healthy' ? 'default' : 'destructive'}
                      className="text-sm"
                    >
                      {securityHealth.status.toUpperCase()}
                    </Badge>
                    <span className="text-sm text-gray-600">
                      {securityHealth.checks.length} checks performed
                    </span>
                  </div>
                  
                  <div className="grid gap-3">
                    {securityHealth.checks.map((check, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(check.status)}
                          <span className="font-medium">{check.name}</span>
                        </div>
                        <span className="text-sm text-gray-600">{check.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  {isLoading ? 'Loading security health...' : 'Security health data unavailable'}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Recent Events (24h)</span>
                    <Badge>{recentEvents.length}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Critical Events</span>
                    <Badge variant="destructive">
                      {recentEvents.filter(e => e.severity === 'critical').length}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>File Monitoring</span>
                    <Badge variant={securityConfig.enableFileIntegrityMonitoring ? 'default' : 'secondary'}>
                      {securityConfig.enableFileIntegrityMonitoring ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Intrusion Detection</span>
                    <Badge variant={securityConfig.enableIntrustionDetection ? 'default' : 'secondary'}>
                      {securityConfig.enableIntrustionDetection ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  onClick={loadSecurityData} 
                  disabled={isLoading}
                  className="w-full"
                  variant="outline"
                >
                  Refresh Security Data
                </Button>
                <Button 
                  onClick={generateNewEncryptionKey}
                  disabled={isLoading}
                  className="w-full"
                  variant="outline"
                >
                  <Key className="w-4 h-4 mr-2" />
                  Generate New Encryption Key
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Security Monitoring */}
        <TabsContent value="monitoring" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Security Monitoring Settings
              </CardTitle>
              <CardDescription>
                Configure security monitoring and logging behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium">Enable Security Logging</label>
                    <p className="text-sm text-gray-600">Log all security-related events</p>
                  </div>
                  <Switch
                    checked={securityConfig.enableLogging}
                    onCheckedChange={(checked) => 
                      setSecurityConfig(prev => ({ ...prev, enableLogging: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium">Intrusion Detection</label>
                    <p className="text-sm text-gray-600">Monitor for suspicious activities</p>
                  </div>
                  <Switch
                    checked={securityConfig.enableIntrustionDetection}
                    onCheckedChange={(checked) => 
                      setSecurityConfig(prev => ({ ...prev, enableIntrustionDetection: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium">File Integrity Monitoring</label>
                    <p className="text-sm text-gray-600">Monitor critical files for changes</p>
                  </div>
                  <Switch
                    checked={securityConfig.enableFileIntegrityMonitoring}
                    onCheckedChange={(checked) => 
                      setSecurityConfig(prev => ({ ...prev, enableFileIntegrityMonitoring: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium">Critical Event Alerts</label>
                    <p className="text-sm text-gray-600">Alert on critical security events</p>
                  </div>
                  <Switch
                    checked={securityConfig.alertOnCriticalEvents}
                    onCheckedChange={(checked) => 
                      setSecurityConfig(prev => ({ ...prev, alertOnCriticalEvents: checked }))
                    }
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Log Retention (Days)</label>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={securityConfig.logRetentionDays}
                      onChange={(e) => 
                        setSecurityConfig(prev => ({ ...prev, logRetentionDays: parseInt(e.target.value) || 30 }))
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Max Failed Attempts</label>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={securityConfig.maxFailedAttempts}
                      onChange={(e) => 
                        setSecurityConfig(prev => ({ ...prev, maxFailedAttempts: parseInt(e.target.value) || 5 }))
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-2">Lockout Duration (Minutes)</label>
                    <Input
                      type="number"
                      min="1"
                      max="1440"
                      value={securityConfig.lockoutDurationMinutes}
                      onChange={(e) => 
                        setSecurityConfig(prev => ({ ...prev, lockoutDurationMinutes: parseInt(e.target.value) || 15 }))
                      }
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Encryption Settings */}
        <TabsContent value="encryption" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                Encryption Configuration
              </CardTitle>
              <CardDescription>
                Configure encryption algorithms and parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Encryption Algorithm</label>
                  <Select
                    value={encryptionConfig.algorithm}
                    onValueChange={(value) => 
                      setEncryptionConfig(prev => ({ ...prev, algorithm: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aes-256-gcm">AES-256-GCM</SelectItem>
                      <SelectItem value="aes-256-cbc">AES-256-CBC</SelectItem>
                      <SelectItem value="chacha20-poly1305">ChaCha20-Poly1305</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Key Derivation</label>
                  <Select
                    value={encryptionConfig.keyDerivation}
                    onValueChange={(value: 'scrypt' | 'pbkdf2') => 
                      setEncryptionConfig(prev => ({ ...prev, keyDerivation: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scrypt">Scrypt</SelectItem>
                      <SelectItem value="pbkdf2">PBKDF2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Iterations</label>
                  <Input
                    type="number"
                    min="10000"
                    max="1000000"
                    value={encryptionConfig.iterations || 100000}
                    onChange={(e) => 
                      setEncryptionConfig(prev => ({ ...prev, iterations: parseInt(e.target.value) || 100000 }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Key Length (bytes)</label>
                  <Input
                    type="number"
                    min="16"
                    max="64"
                    value={encryptionConfig.keyLength}
                    onChange={(e) => 
                      setEncryptionConfig(prev => ({ ...prev, keyLength: parseInt(e.target.value) || 32 }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Salt Length (bytes)</label>
                  <Input
                    type="number"
                    min="8"
                    max="32"
                    value={encryptionConfig.saltLength}
                    onChange={(e) => 
                      setEncryptionConfig(prev => ({ ...prev, saltLength: parseInt(e.target.value) || 16 }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">IV Length (bytes)</label>
                  <Input
                    type="number"
                    min="8"
                    max="32"
                    value={encryptionConfig.ivLength}
                    onChange={(e) => 
                      setEncryptionConfig(prev => ({ ...prev, ivLength: parseInt(e.target.value) || 16 }))
                    }
                  />
                </div>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Changing encryption settings will affect new encrypted data only. 
                  Existing encrypted data will still use the previous settings for decryption.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Events */}
        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Recent Security Events
              </CardTitle>
              <CardDescription>
                Security events from the last 24 hours
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentEvents.length > 0 ? (
                <div className="space-y-3">
                  {recentEvents.slice(0, 20).map((event) => (
                    <div key={event.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={getSeverityColor(event.severity)}>
                            {event.severity}
                          </Badge>
                          <span className="text-sm font-medium">{event.type}</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {event.timestamp.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{event.description}</p>
                      <p className="text-xs text-gray-500 mt-1">Source: {event.source}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No security events in the last 24 hours
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Settings */}
        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Security Settings</CardTitle>
              <CardDescription>
                Advanced configuration options for security features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  These settings are for advanced users only. Incorrect configuration may compromise security.
                </AlertDescription>
              </Alert>
              
              <div className="text-center py-8 text-gray-500">
                Advanced settings panel - Additional security features can be configured here
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={loadSecurityData} disabled={isLoading}>
          Refresh
        </Button>
        <Button onClick={saveSecurityConfig} disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  );
}
