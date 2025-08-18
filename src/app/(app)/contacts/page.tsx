'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MainContent } from '../../components/layout/MainContent';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { SyncStatusIndicator, SyncStatus } from '../../components/ui/SyncStatusIndicator';
import { ContactsErrorBoundary, useErrorHandler } from '../../components/ui/ContactsErrorBoundary';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';
import { apiClient, RETRY_PRESETS } from '@/lib/utils/api-retry';
import { ApiErrorResponse } from '@/lib/utils/api-errors';

interface Contact {
  id: string;
  name?: string;
  pushName?: string;
  notify?: string;
  verifiedName?: string;
  status?: string;
  phoneNumber?: string;
  isBusiness: boolean;
  isMyContact: boolean;
  isBlocked: boolean;
  isFavorite: boolean;
  profilePicUrl?: string;
  lastSeen?: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string;
}

interface Group {
  id: string;
  subject: string;
  description?: string;
  owner?: string;
  creation?: number;
  size: number;
  participantCount: number;
  participants: number;
  canSend: boolean;
  profilePicUrl?: string;
  userRole?: string;
  isOwner: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string;
}

interface Pagination {
  total: number;
  returned: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  page: number;
  totalPages: number;
}

interface Statistics {
  total: number;
  active: number;
  inactive: number;
  favorites: number;
  business: number;
  myContacts: number;
  blocked: number;
}

interface ApiResponse<T> {
  success: boolean;
  contacts?: T[];
  groups?: T[];
  pagination: Pagination;
  statistics: Statistics;
  metadata: {
    fromDatabase: boolean;
    whatsappConnected: boolean;
    lastSync: string | null;
    syncInProgress: boolean;
  };
  error?: string;
}

function ContactsPageContent() {
  const { addToast } = useToast();
  const { handleError } = useErrorHandler();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'contacts' | 'groups'>('contacts');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
  // Pagination state
  const [contactsPagination, setContactsPagination] = useState<Pagination | null>(null);
  const [groupsPagination, setGroupsPagination] = useState<Pagination | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Statistics and metadata (removed unused variables)
  const [metadata, setMetadata] = useState<{
    fromDatabase: boolean;
    whatsappConnected: boolean;
    lastSync: string | null;
    syncInProgress: boolean;
  } | null>(null);
  
  // Real-time updates state
  const [realTimeConnected, setRealTimeConnected] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ 
    inProgress: false 
  });
  
  // Advanced filtering state
  const [filters, setFilters] = useState<{
    favorites: boolean;
    business: boolean;
    myContacts: boolean;
    blocked: boolean;
    showFilters: boolean;
  }>({
    favorites: false,
    business: false,
    myContacts: false,
    blocked: false,
    showFilters: false
  });

  // Sync statistics state
  const [syncStats, setSyncStats] = useState<{
    lastSyncResult?: {
      contacts: { total: number; new: number; updated: number; errors: number };
      groups: { total: number; new: number; updated: number; errors: number };
      duration: number;
      timestamp: string;
    };
    showStats: boolean;
  }>({ showStats: false });

  const fetchData = useCallback(async (reset = true, loadMore = false) => {
    try {
      if (reset) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      
      // Build query parameters
      const contactsParams = new URLSearchParams({
        limit: '50',
        offset: loadMore && !reset ? ((contactsPagination?.offset || 0) + (contactsPagination?.returned || 0)).toString() : '0'
      });
      
      const groupsParams = new URLSearchParams({
        limit: '50', 
        offset: loadMore && !reset ? ((groupsPagination?.offset || 0) + (groupsPagination?.returned || 0)).toString() : '0'
      });

      if (searchTerm) {
        contactsParams.set('search', searchTerm);
        groupsParams.set('search', searchTerm);
      }

      // Add filter parameters for contacts
      if (filters.favorites) contactsParams.set('isFavorite', 'true');
      if (filters.business) contactsParams.set('isBusiness', 'true');
      if (filters.myContacts) contactsParams.set('isMyContact', 'true');
      if (filters.blocked) contactsParams.set('isBlocked', 'true');
      
      // Fetch contacts and groups in parallel with retry logic
      const [contactsData, groupsData] = await Promise.all([
        apiClient.get<ApiResponse<Contact>>(`/contacts?${contactsParams}`, RETRY_PRESETS.standard) as Promise<ApiResponse<Contact>>,
        apiClient.get<ApiResponse<Group>>(`/groups?${groupsParams}`, RETRY_PRESETS.standard) as Promise<ApiResponse<Group>>,
      ]);

      if (contactsData.success) {
        if (loadMore && !reset) {
          setContacts(prev => [...prev, ...(contactsData.contacts || [])]);
        } else {
          setContacts(contactsData.contacts || []);
        }
        setContactsPagination(contactsData.pagination);
        setMetadata(contactsData.metadata);
      } else {
        setError(contactsData.error || 'Failed to fetch contacts');
      }
      
      if (groupsData.success) {
        if (loadMore && !reset) {
          setGroups(prev => [...prev, ...(groupsData.groups || [])]);
        } else {
          setGroups(groupsData.groups || []);
        }
        setGroupsPagination(groupsData.pagination);
        if (!metadata) {
          setMetadata(groupsData.metadata);
        }
      } else if (!contactsData.success) {
        setError(groupsData.error || 'Failed to fetch groups');
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      
      // Handle API error responses
      if (error && typeof error === 'object' && 'code' in error) {
        const apiError = error as ApiErrorResponse;
        setError(apiError.message || 'Failed to fetch data');
        
        // Show toast with retry actions if available
        if (apiError.actions && apiError.actions.length > 0) {
          const retryAction = apiError.actions.find(action => action.type === 'retry');
          if (retryAction) {
            addToast({
              type: 'error',
              title: 'Data Fetch Failed',
              message: apiError.message,
              duration: 8000,
              action: {
                label: 'Retry',
                onClick: () => {
                  setError(null);
                  if (retryAction.delay) {
                    setTimeout(() => fetchData(reset, loadMore), retryAction.delay);
                  } else {
                    fetchData(reset, loadMore);
                  }
                }
              }
            });
          }
        }
      } else {
        setError('Network error occurred while fetching data');
        handleError(error instanceof Error ? error : new Error('Unknown fetch error'));
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [searchTerm, contactsPagination, groupsPagination, metadata, filters, addToast, handleError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleFavorite = async (contactId: string) => {
    // Optimistic update
    const originalContacts = [...contacts];
    const contactToUpdate = contacts.find(c => c.id === contactId);
    
    if (!contactToUpdate) return;
    
    const newFavoriteStatus = !contactToUpdate.isFavorite;
    
    setContacts(prev => prev.map(contact => 
      contact.id === contactId 
        ? { ...contact, isFavorite: newFavoriteStatus }
        : contact
    ));

    try {
      const data = await apiClient.post('/contacts/favorites', 
        { contactId }, 
        RETRY_PRESETS.quick
      ) as { success: boolean; results?: { success?: Contact[] }; message?: string };
      
      if (data.success) {
        // Success - update with server response if available
        if (data.results?.success?.[0]) {
          const updatedContact = data.results.success[0];
          setContacts(prev => prev.map(contact => 
            contact.id === contactId 
              ? { ...contact, isFavorite: updatedContact.isFavorite }
              : contact
          ));
        }
        
        // Show success toast
        addToast({
          type: 'success',
          title: newFavoriteStatus ? 'Added to Favorites' : 'Removed from Favorites',
          message: `${contactToUpdate.name || contactToUpdate.pushName || 'Contact'} ${newFavoriteStatus ? 'added to' : 'removed from'} favorites`,
          duration: 3000
        });
      } else {
        // Rollback on failure
        setContacts(originalContacts);
        setError(data.message || 'Failed to update favorite status');
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      // Rollback on error
      setContacts(originalContacts);
      console.error('Failed to toggle favorite:', error);
      
      // Handle API error responses
      if (error && typeof error === 'object' && 'code' in error) {
        const apiError = error as ApiErrorResponse;
        setError(apiError.message || 'Failed to update favorite status');
        
        // Show toast with retry option
        addToast({
          type: 'error',
          title: 'Favorite Update Failed',
          message: apiError.message,
          duration: 6000,
          action: {
            label: 'Retry',
            onClick: () => toggleFavorite(contactId)
          }
        });
      } else {
        setError('Network error occurred while updating favorite');
        handleError(error instanceof Error ? error : new Error('Unknown favorite toggle error'));
      }
      
      setTimeout(() => setError(null), 5000);
    }
  };

  const loadMoreItems = () => {
    const pagination = activeTab === 'contacts' ? contactsPagination : groupsPagination;
    if (pagination?.hasMore && !loadingMore) {
      fetchData(false, true);
    }
  };

  // Debounced search and filter effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchData(true, false);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, filters, fetchData]);

  const handleSendToSelected = () => {
    if (selectedItems.size === 0) {
      alert('Please select at least one contact or group');
      return;
    }
    
    // Navigate to upload page with selected items
    const params = new URLSearchParams();
    params.set('targets', Array.from(selectedItems).join(','));
    params.set('type', activeTab);
    window.location.href = `/upload?${params.toString()}`;
  };

  const toggleSelection = (id: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Since we're using server-side filtering, we don't need client-side filtering
  const displayedContacts = contacts;
  const displayedGroups = groups;

  const getContactDisplayName = (contact: Contact) => {
    return contact.verifiedName || contact.name || contact.pushName || contact.notify || contact.phoneNumber || 'Unknown Contact';
  };

  const formatLastSync = (lastSync: string | null) => {
    if (!lastSync) return 'Never';
    const date = new Date(lastSync);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const highlightSearchTerm = (text: string, searchTerm: string) => {
    if (!searchTerm || !text) return text;
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 text-yellow-900 px-1 rounded">
          {part}
        </mark>
      ) : part
    );
  };

  // Real-time update handlers
  const handleContactUpdate = useCallback((data: { type?: string; contacts?: Contact[] }) => {
    console.log('Real-time contact update:', data);
    
    if (data.type === 'add' || data.type === 'discovered') {
      // Add new contacts
      setContacts(prev => {
        const newContacts = [...prev];
        data.contacts?.forEach((contact: Contact) => {
          const existingIndex = newContacts.findIndex(c => c.id === contact.id);
          if (existingIndex === -1) {
            newContacts.push(contact);
          }
        });
        return newContacts;
      });
    } else if (data.type === 'update' || data.type === 'presence') {
      // Update existing contacts
      setContacts(prev => prev.map(contact => {
        const updatedContact = data.contacts?.find((c: Contact) => c.id === contact.id);
        return updatedContact ? { ...contact, ...updatedContact } : contact;
      }));
    }
  }, []);

  const handleGroupUpdate = useCallback((data: { type?: string; groups?: Group[] }) => {
    console.log('Real-time group update:', data);
    
    if (data.type === 'add') {
      // Add new groups
      setGroups(prev => {
        const newGroups = [...prev];
        data.groups?.forEach((group: Group) => {
          const existingIndex = newGroups.findIndex(g => g.id === group.id);
          if (existingIndex === -1) {
            newGroups.push(group);
          }
        });
        return newGroups;
      });
    } else if (data.type === 'update' || data.type === 'participants_update') {
      // Update existing groups
      setGroups(prev => prev.map(group => {
        const updatedGroup = data.groups?.find((g: Group) => g.id === group.id);
        return updatedGroup ? { ...group, ...updatedGroup } : group;
      }));
    }
  }, []);

  const handleSyncProgress = useCallback((data: { 
    stage?: string; 
    message?: string; 
    progress?: { current: number; total: number } 
  }) => {
    console.log('Sync progress:', data);
    setSyncStatus(prev => ({
      ...prev,
      inProgress: true,
      message: data.message || 'Syncing...',
      progress: data.progress
    }));
    
    // Update metadata to show sync in progress
    setMetadata(prev => prev ? { ...prev, syncInProgress: true } : null);
  }, []);

  const handleSyncCompleted = useCallback((data: { 
    message?: string; 
    result?: {
      contacts: { total: number; new: number; updated: number; errors: number };
      groups: { total: number; new: number; updated: number; errors: number };
      duration: number;
      timestamp: string;
    };
    hasErrors?: boolean;
  }) => {
    console.log('Sync completed:', data);
    
    const lastSync = new Date().toISOString();
    setSyncStatus({
      inProgress: false,
      lastSync,
      message: undefined,
      error: undefined
    });
    
    // Store sync statistics if available
    if (data.result) {
      setSyncStats({
        lastSyncResult: data.result,
        showStats: true
      });
    }
    
    // Update metadata
    setMetadata(prev => prev ? { 
      ...prev, 
      syncInProgress: false,
      lastSync
    } : null);

    // Show success toast notification
    if (data.result) {
      const { contacts, groups, duration } = data.result;
      const totalItems = contacts.total + groups.total;
      const hasErrors = contacts.errors > 0 || groups.errors > 0;
      
      addToast({
        type: hasErrors ? 'warning' : 'success',
        title: hasErrors ? 'Sync Completed with Warnings' : 'Sync Completed Successfully',
        message: `Synchronized ${totalItems} items (${contacts.total} contacts, ${groups.total} groups) in ${(duration / 1000).toFixed(1)}s${hasErrors ? `. ${contacts.errors + groups.errors} items had errors.` : ''}`,
        duration: hasErrors ? 8000 : 5000
      });
    } else {
      addToast({
        type: 'success',
        title: 'Sync Completed',
        message: 'Data synchronization completed successfully',
        duration: 5000
      });
    }
    
    // Refresh data after sync completion
    setTimeout(() => {
      fetchData(true, false);
    }, 1000);
  }, [fetchData, addToast]);

  // Sync trigger function with enhanced error handling
  const triggerSync = useCallback(async (type: 'full' | 'incremental' = 'full', force = false) => {
    if (syncStatus.inProgress) {
      addToast({
        type: 'warning',
        title: 'Sync Already Running',
        message: 'Please wait for the current sync to complete',
        duration: 3000
      });
      return;
    }

    setSyncStatus(prev => ({
      ...prev,
      inProgress: true,
      type,
      message: `Starting ${type} sync...`,
      error: undefined,
      progress: { current: 0, total: 100 }
    }));

    try {
      const data = await apiClient.post('/contacts', 
        { type, force }, 
        RETRY_PRESETS.long
      ) as { 
        success: boolean; 
        result?: {
          contacts: { total: number; new: number; updated: number; errors: number };
          groups: { total: number; new: number; updated: number; errors: number };
          duration: number;
          timestamp: string;
        };
        message?: string;
        error?: string;
        actions?: Array<{ type: string; label?: string; delay?: number }>;
      };

      if (data.success) {
        const lastSync = new Date().toISOString();
        setSyncStatus({
          inProgress: false,
          type: undefined,
          lastSync,
          message: undefined,
          error: undefined
        });

        // Store sync statistics
        setSyncStats({
          lastSyncResult: data.result,
          showStats: true
        });

        // Update metadata
        setMetadata(prev => prev ? {
          ...prev,
          syncInProgress: false,
          lastSync: data.result.timestamp
        } : null);

        // Show success toast
        const { contacts, groups, duration } = data.result;
        const totalItems = contacts.total + groups.total;
        const hasErrors = contacts.errors > 0 || groups.errors > 0;
        
        addToast({
          type: hasErrors ? 'warning' : 'success',
          title: `${type === 'full' ? 'Full' : 'Incremental'} Sync Completed`,
          message: `Synchronized ${totalItems} items in ${(duration / 1000).toFixed(1)}s${hasErrors ? ` with ${contacts.errors + groups.errors} errors` : ''}`,
          duration: hasErrors ? 8000 : 5000
        });

        // Refresh data
        setTimeout(() => {
          fetchData(true, false);
        }, 1000);

      } else {
        // Handle API error responses with enhanced error information
        setSyncStatus({
          inProgress: false,
          type: undefined,
          error: data.message || data.error || 'Sync failed'
        });

        // Show detailed error toast with actions
        const actions: Array<{ label: string; onClick: () => void }> = [];
        if (data.actions) {
          data.actions.forEach((action: { type: string; label?: string; delay?: number }) => {
            if (action.type === 'retry' || action.type === 'incremental_sync') {
              actions.push({
                label: action.label || 'Retry',
                onClick: () => {
                  if (action.delay) {
                    setTimeout(() => triggerSync(action.type === 'incremental_sync' ? 'incremental' : type, force), action.delay);
                  } else {
                    triggerSync(action.type === 'incremental_sync' ? 'incremental' : type, force);
                  }
                }
              });
            } else if (action.type === 'force_sync') {
              actions.push({
                label: action.label || 'Force Sync',
                onClick: () => triggerSync('full', true)
              });
            } else if (action.type === 'reconnect') {
              actions.push({
                label: action.label || 'Reconnect',
                onClick: () => window.location.href = '/auth'
              });
            }
          });
        }

        addToast({
          type: 'error',
          title: `${type === 'full' ? 'Full' : 'Incremental'} Sync Failed`,
          message: data.message || data.error || 'An error occurred during synchronization',
          duration: 10000,
          action: actions.length > 0 ? actions[0] : {
            label: 'Retry',
            onClick: () => triggerSync(type, force)
          }
        });
      }
    } catch (error) {
      console.error('Sync error:', error);
      
      // Handle API error responses
      if (error && typeof error === 'object' && 'code' in error) {
        const apiError = error as ApiErrorResponse;
        setSyncStatus({
          inProgress: false,
          type: undefined,
          error: apiError.message || 'Sync failed'
        });

        // Show detailed error toast with actions
        const actions: Array<{ label: string; onClick: () => void }> = [];
        if (apiError.actions) {
          apiError.actions.forEach((action: { type: string; label?: string; delay?: number }) => {
            if (action.type === 'retry' || action.type === 'incremental_sync') {
              actions.push({
                label: action.label || 'Retry',
                onClick: () => {
                  if (action.delay) {
                    setTimeout(() => triggerSync(action.type === 'incremental_sync' ? 'incremental' : type, force), action.delay);
                  } else {
                    triggerSync(action.type === 'incremental_sync' ? 'incremental' : type, force);
                  }
                }
              });
            } else if (action.type === 'force_sync') {
              actions.push({
                label: action.label || 'Force Sync',
                onClick: () => triggerSync('full', true)
              });
            } else if (action.type === 'reconnect') {
              actions.push({
                label: action.label || 'Reconnect',
                onClick: () => window.location.href = '/auth'
              });
            }
          });
        }

        addToast({
          type: 'error',
          title: `${type === 'full' ? 'Full' : 'Incremental'} Sync Failed`,
          message: apiError.message || 'An error occurred during synchronization',
          duration: 10000,
          action: actions.length > 0 ? actions[0] : {
            label: 'Retry',
            onClick: () => triggerSync(type, force)
          }
        });
      } else {
        setSyncStatus({
          inProgress: false,
          type: undefined,
          error: 'Network error occurred during sync'
        });

        // Show network error toast
        addToast({
          type: 'error',
          title: 'Network Error',
          message: 'Failed to connect to the server. Please check your internet connection.',
          duration: 8000,
          action: {
            label: 'Retry',
            onClick: () => triggerSync(type, force)
          }
        });
        
        handleError(error instanceof Error ? error : new Error('Unknown sync error'));
      }
    }
  }, [syncStatus.inProgress, addToast, fetchData, handleError]);

  const handleSyncFailed = useCallback((data: { 
    error?: string | Error; 
    timestamp?: string;
    retryable?: boolean;
    retryAfter?: number;
  }) => {
    console.log('Sync failed:', data);
    
    const errorMessage = data.error instanceof Error ? data.error.message : (data.error || 'Sync failed');
    
    setSyncStatus({
      inProgress: false,
      error: errorMessage,
      lastSync: syncStatus.lastSync
    });
    
    // Update metadata
    setMetadata(prev => prev ? { ...prev, syncInProgress: false } : null);

    // Show error toast notification with retry option
    addToast({
      type: 'error',
      title: 'Sync Failed',
      message: errorMessage,
      duration: 10000,
      action: data.retryable !== false ? {
        label: 'Retry Sync',
        onClick: () => triggerSync('incremental')
      } : undefined
    });
  }, [syncStatus.lastSync, addToast, triggerSync]);

  const handleRealTimeConnected = useCallback(() => {
    console.log('Real-time updates connected');
    setRealTimeConnected(true);
  }, []);

  const handleRealTimeDisconnected = useCallback(() => {
    console.log('Real-time updates disconnected');
    setRealTimeConnected(false);
  }, []);

  const handleRealTimeError = useCallback((error: string) => {
    console.error('Real-time update error:', error);
    
    // Show error toast for real-time connection issues
    addToast({
      type: 'warning',
      title: 'Real-time Updates Disconnected',
      message: 'Live updates are temporarily unavailable. Data will still sync manually.',
      duration: 6000
    });
  }, [addToast]);

  // Initialize real-time updates
  const { reconnect: reconnectRealTime } = useRealTimeUpdates({
    onContactUpdate: handleContactUpdate,
    onGroupUpdate: handleGroupUpdate,
    onSyncProgress: handleSyncProgress,
    onSyncCompleted: handleSyncCompleted,
    onSyncFailed: handleSyncFailed,
    onConnected: handleRealTimeConnected,
    onDisconnected: handleRealTimeDisconnected,
    onError: handleRealTimeError,
    enabled: metadata?.whatsappConnected ?? false
  });

  return (
    <MainContent 
      title="Contacts & Groups" 
      subtitle="Manage your WhatsApp contacts and groups"
      actions={
        <div className="flex items-center space-x-2">
          {selectedItems.size > 0 && (
            <Button
              onClick={handleSendToSelected}
              size="sm"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send to Selected ({selectedItems.size})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerSync('full')}
            disabled={syncStatus.inProgress || !metadata?.whatsappConnected}
          >
            {syncStatus.inProgress ? (
              <>
                <svg className="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Syncing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync Now
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true, false)}
            disabled={loading}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-800">{error}</p>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-400 hover:text-red-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Connection Status */}
        {metadata && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-2 ${metadata.whatsappConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-gray-600">
                    {metadata.whatsappConnected ? 'WhatsApp Connected' : 'WhatsApp Disconnected'}
                  </span>
                </div>
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-2 ${realTimeConnected ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                  <span className="text-gray-600">
                    {realTimeConnected ? 'Live Updates' : 'Updates Offline'}
                  </span>
                </div>
                <div className="text-gray-500">
                  Last sync: {formatLastSync(metadata.lastSync)}
                </div>
                {(metadata.syncInProgress || syncStatus.inProgress) && (
                  <div className="flex items-center text-blue-600">
                    <svg className="w-4 h-4 mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {syncStatus.message || 'Syncing...'}
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-500">
                  {metadata.fromDatabase ? 'From Database' : 'Live Data'}
                </span>
                {!realTimeConnected && metadata.whatsappConnected && (
                  <button
                    onClick={reconnectRealTime}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Reconnect
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sync Status Indicator */}
        {(syncStatus.inProgress || syncStatus.error || syncStatus.message) && (
          <SyncStatusIndicator
            status={syncStatus}
            onRetry={() => triggerSync('incremental')}
            onCancel={() => {
              // Note: Cancel functionality would need to be implemented in the backend
              addToast({
                type: 'info',
                title: 'Sync Cancellation',
                message: 'Sync cancellation is not yet implemented. Please wait for completion.',
                duration: 4000
              });
            }}
            className="border-blue-200"
          />
        )}

        {/* Sync Statistics */}
        {syncStats.lastSyncResult && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-blue-900">Last Sync Results</h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-blue-600">
                  {new Date(syncStats.lastSyncResult.timestamp).toLocaleString()}
                </span>
                <button
                  onClick={() => setSyncStats(prev => ({ ...prev, showStats: !prev.showStats }))}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  {syncStats.showStats ? 'Hide' : 'Show'} Details
                </button>
              </div>
            </div>
            
            {syncStats.showStats && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <h4 className="font-medium text-gray-900 mb-2">Contacts</h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total:</span>
                      <span className="font-medium">{syncStats.lastSyncResult.contacts.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-600">New:</span>
                      <span className="font-medium text-green-700">{syncStats.lastSyncResult.contacts.new}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-600">Updated:</span>
                      <span className="font-medium text-blue-700">{syncStats.lastSyncResult.contacts.updated}</span>
                    </div>
                    {syncStats.lastSyncResult.contacts.errors > 0 && (
                      <div className="flex justify-between">
                        <span className="text-red-600">Errors:</span>
                        <span className="font-medium text-red-700">{syncStats.lastSyncResult.contacts.errors}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <h4 className="font-medium text-gray-900 mb-2">Groups</h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total:</span>
                      <span className="font-medium">{syncStats.lastSyncResult.groups.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-600">New:</span>
                      <span className="font-medium text-green-700">{syncStats.lastSyncResult.groups.new}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-600">Updated:</span>
                      <span className="font-medium text-blue-700">{syncStats.lastSyncResult.groups.updated}</span>
                    </div>
                    {syncStats.lastSyncResult.groups.errors > 0 && (
                      <div className="flex justify-between">
                        <span className="text-red-600">Errors:</span>
                        <span className="font-medium text-red-700">{syncStats.lastSyncResult.groups.errors}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <div className="mt-3 pt-3 border-t border-blue-200 flex items-center justify-between text-xs text-blue-600">
              <span>Duration: {(syncStats.lastSyncResult.duration / 1000).toFixed(1)}s</span>
              <div className="flex space-x-2">
                <button
                  onClick={() => triggerSync('incremental')}
                  disabled={syncStatus.inProgress}
                  className="hover:text-blue-800 underline"
                >
                  Incremental Sync
                </button>
                <button
                  onClick={() => triggerSync('full')}
                  disabled={syncStatus.inProgress}
                  className="hover:text-blue-800 underline"
                >
                  Full Sync
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search contacts or groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
              icon={
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilters(prev => ({ ...prev, showFilters: !prev.showFilters }))}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {(filters.favorites || filters.business || filters.myContacts || filters.blocked) && (
              <Badge variant="info" size="sm" className="ml-2">
                {[filters.favorites, filters.business, filters.myContacts, filters.blocked].filter(Boolean).length}
              </Badge>
            )}
          </Button>
        </div>

        {/* Advanced Filters */}
        {filters.showFilters && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-900">Filter Contacts</h3>
              <button
                onClick={() => setFilters({
                  favorites: false,
                  business: false,
                  myContacts: false,
                  blocked: false,
                  showFilters: true
                })}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear All
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.favorites}
                  onChange={(e) => setFilters(prev => ({ ...prev, favorites: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Favorites</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.business}
                  onChange={(e) => setFilters(prev => ({ ...prev, business: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Business</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.myContacts}
                  onChange={(e) => setFilters(prev => ({ ...prev, myContacts: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">My Contacts</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.blocked}
                  onChange={(e) => setFilters(prev => ({ ...prev, blocked: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Blocked</span>
              </label>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('contacts')}
              className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'contacts'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Contacts
              <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2.5 rounded-full text-xs">
                {contactsPagination?.total || contacts.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'groups'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Groups
              <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2.5 rounded-full text-xs">
                {groupsPagination?.total || groups.length}
              </span>
            </button>
          </nav>
        </div>

        {/* Pagination Info */}
        {(contactsPagination || groupsPagination) && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div>
              {activeTab === 'contacts' && contactsPagination && (
                <span>
                  Showing {contactsPagination.offset + 1} to {contactsPagination.offset + contactsPagination.returned} of {contactsPagination.total} contacts
                  {searchTerm && ` matching "${searchTerm}"`}
                </span>
              )}
              {activeTab === 'groups' && groupsPagination && (
                <span>
                  Showing {groupsPagination.offset + 1} to {groupsPagination.offset + groupsPagination.returned} of {groupsPagination.total} groups
                  {searchTerm && ` matching "${searchTerm}"`}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {activeTab === 'contacts' && contactsPagination && contactsPagination.totalPages > 1 && (
                <span>Page {contactsPagination.page} of {contactsPagination.totalPages}</span>
              )}
              {activeTab === 'groups' && groupsPagination && groupsPagination.totalPages > 1 && (
                <span>Page {groupsPagination.page} of {groupsPagination.totalPages}</span>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white p-4 rounded-lg border border-gray-200 animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {activeTab === 'contacts' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedContacts.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-white rounded-lg border border-gray-200">
                      <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <p className="text-gray-500">
                        {searchTerm && (filters.favorites || filters.business || filters.myContacts || filters.blocked) 
                          ? `No contacts found matching "${searchTerm}" with the selected filters`
                          : searchTerm 
                          ? `No contacts found matching "${searchTerm}"`
                          : (filters.favorites || filters.business || filters.myContacts || filters.blocked)
                          ? 'No contacts found with the selected filters'
                          : 'No contacts found'}
                      </p>
                      {!metadata?.whatsappConnected && (
                        <p className="text-xs text-gray-400 mt-2">
                          Connect to WhatsApp to sync your contacts
                        </p>
                      )}
                      {(filters.favorites || filters.business || filters.myContacts || filters.blocked) && (
                        <button
                          onClick={() => setFilters(prev => ({ ...prev, favorites: false, business: false, myContacts: false, blocked: false }))}
                          className="text-xs text-blue-600 hover:text-blue-800 underline mt-2"
                        >
                          Clear filters to see all contacts
                        </button>
                      )}
                    </div>
                  ) : (
                    displayedContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className={`bg-white p-4 rounded-lg border ${
                          selectedItems.has(contact.id) 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        } cursor-pointer transition-colors`}
                        onClick={() => toggleSelection(contact.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1 min-w-0">
                            <div className="relative flex-shrink-0">
                              {contact.profilePicUrl ? (
                                <img
                                  src={contact.profilePicUrl}
                                  alt={getContactDisplayName(contact)}
                                  className="w-12 h-12 rounded-full object-cover"
                                  onError={(e) => {
                                    // Fallback to initials if image fails to load
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div 
                                className={`w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center ${contact.profilePicUrl ? 'hidden' : ''}`}
                              >
                                <span className="text-lg font-medium text-gray-600">
                                  {getContactDisplayName(contact).charAt(0).toUpperCase()}
                                </span>
                              </div>
                              {selectedItems.has(contact.id) && (
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-1">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {searchTerm ? highlightSearchTerm(getContactDisplayName(contact), searchTerm) : getContactDisplayName(contact)}
                                </p>
                                <div className="flex space-x-1">
                                  {contact.isBusiness && (
                                    <Badge variant="info" size="sm">Business</Badge>
                                  )}
                                  {contact.isMyContact && (
                                    <Badge variant="default" size="sm">My Contact</Badge>
                                  )}
                                  {contact.isBlocked && (
                                    <Badge variant="error" size="sm">Blocked</Badge>
                                  )}
                                </div>
                              </div>
                              {contact.phoneNumber && (
                                <p className="text-xs text-gray-500 truncate">
                                  {searchTerm ? highlightSearchTerm(contact.phoneNumber, searchTerm) : contact.phoneNumber}
                                </p>
                              )}
                              {contact.status && (
                                <p className="text-xs text-gray-400 truncate mt-1">
                                  {contact.status}
                                </p>
                              )}
                              <p className="text-xs text-gray-400 mt-1">
                                Synced {formatLastSync(contact.lastSyncAt)}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(contact.id);
                            }}
                            className="p-1 hover:bg-gray-100 rounded flex-shrink-0"
                          >
                            <svg 
                              className={`w-5 h-5 ${contact.isFavorite ? 'text-yellow-500 fill-current' : 'text-gray-400'}`} 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                {/* Load More Button for Contacts */}
                {contactsPagination?.hasMore && (
                  <div className="text-center">
                    <Button
                      variant="outline"
                      onClick={loadMoreItems}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <>
                          <svg className="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Loading...
                        </>
                      ) : (
                        `Load More (${contactsPagination.total - contactsPagination.offset - contactsPagination.returned} remaining)`
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'groups' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedGroups.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-white rounded-lg border border-gray-200">
                      <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <p className="text-gray-500">
                        {searchTerm 
                          ? `No groups found matching "${searchTerm}"`
                          : 'No groups found'}
                      </p>
                      {!metadata?.whatsappConnected && (
                        <p className="text-xs text-gray-400 mt-2">
                          Connect to WhatsApp to sync your groups
                        </p>
                      )}
                    </div>
                  ) : (
                    displayedGroups.map((group) => (
                      <div
                        key={group.id}
                        className={`bg-white p-4 rounded-lg border ${
                          selectedItems.has(group.id) 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        } cursor-pointer transition-colors`}
                        onClick={() => toggleSelection(group.id)}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="relative flex-shrink-0">
                            {group.profilePicUrl ? (
                              <img
                                src={group.profilePicUrl}
                                alt={group.subject}
                                className="w-12 h-12 rounded-full object-cover"
                                onError={(e) => {
                                  // Fallback to icon if image fails to load
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const fallback = target.nextElementSibling as HTMLElement;
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div className={`w-12 h-12 bg-green-100 rounded-full flex items-center justify-center ${group.profilePicUrl ? 'hidden' : ''}`}>
                              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                            </div>
                            {selectedItems.has(group.id) && (
                              <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {searchTerm ? highlightSearchTerm(group.subject, searchTerm) : group.subject}
                              </p>
                              <div className="flex space-x-1">
                                {group.isOwner && (
                                  <Badge variant="default" size="sm">Owner</Badge>
                                )}
                                {group.isAdmin && !group.isOwner && (
                                  <Badge variant="info" size="sm">Admin</Badge>
                                )}
                                {!group.canSend && (
                                  <Badge variant="error" size="sm">Cannot Send</Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-gray-500">
                              {group.participantCount} participants
                            </p>
                            {group.description && (
                              <p className="text-xs text-gray-400 truncate mt-1">
                                {searchTerm ? highlightSearchTerm(group.description, searchTerm) : group.description}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              Synced {formatLastSync(group.lastSyncAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                {/* Load More Button for Groups */}
                {groupsPagination?.hasMore && (
                  <div className="text-center">
                    <Button
                      variant="outline"
                      onClick={loadMoreItems}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <>
                          <svg className="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Loading...
                        </>
                      ) : (
                        `Load More (${groupsPagination.total - groupsPagination.offset - groupsPagination.returned} remaining)`
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </MainContent>
  );
}

// Export the wrapped component with error boundary
export default function ContactsPage() {
  return (
    <ContactsErrorBoundary
      onError={(error, errorInfo) => {
        // Log error to monitoring service in production
        console.error('Contacts page error boundary triggered:', error, errorInfo);
        
        // In production, you might want to send this to an error reporting service
        // Example: Sentry.captureException(error, { extra: errorInfo });
      }}
    >
      <ContactsPageContent />
    </ContactsErrorBoundary>
  );
}
