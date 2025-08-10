/**
 * Keyboard Shortcuts System
 * Week 4 - Developer C Implementation
 */

'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { AccessibleModal, useModal } from './AccessibleModal';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  description: string;
  action: () => void;
  category?: string;
  disabled?: boolean;
}

export interface KeyboardShortcutsProps {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({
  shortcuts,
  enabled = true,
}) => {
  const [activeShortcuts, setActiveShortcuts] = useState<KeyboardShortcut[]>([]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
      return;
    }

    const matchingShortcut = shortcuts.find(shortcut => {
      if (shortcut.disabled) return false;
      
      return (
        shortcut.key.toLowerCase() === event.key.toLowerCase() &&
        !!shortcut.ctrlKey === event.ctrlKey &&
        !!shortcut.altKey === event.altKey &&
        !!shortcut.shiftKey === event.shiftKey &&
        !!shortcut.metaKey === event.metaKey
      );
    });

    if (matchingShortcut) {
      event.preventDefault();
      matchingShortcut.action();
    }
  }, [shortcuts, enabled]);

  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [enabled, handleKeyDown]);

  useEffect(() => {
    setActiveShortcuts(shortcuts.filter(s => !s.disabled));
  }, [shortcuts]);

  // This component doesn't render anything by itself
  return null;
};

// Hook for managing keyboard shortcuts
export const useKeyboardShortcuts = (shortcuts: KeyboardShortcut[], enabled = true) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      const matchingShortcut = shortcuts.find(shortcut => {
        if (shortcut.disabled) return false;
        
        return (
          shortcut.key.toLowerCase() === event.key.toLowerCase() &&
          !!shortcut.ctrlKey === event.ctrlKey &&
          !!shortcut.altKey === event.altKey &&
          !!shortcut.shiftKey === event.shiftKey &&
          !!shortcut.metaKey === event.metaKey
        );
      });

      if (matchingShortcut) {
        event.preventDefault();
        matchingShortcut.action();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled]);
};

// Keyboard shortcuts help modal
export interface KeyboardShortcutsHelpProps {
  shortcuts: KeyboardShortcut[];
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({
  shortcuts,
  isOpen,
  onClose,
}) => {
  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce((groups, shortcut) => {
    const category = shortcut.category || 'General';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(shortcut);
    return groups;
  }, {} as Record<string, KeyboardShortcut[]>);

  const formatShortcut = (shortcut: KeyboardShortcut) => {
    const keys: string[] = [];
    
    if (shortcut.metaKey) keys.push('⌘');
    if (shortcut.ctrlKey) keys.push('Ctrl');
    if (shortcut.altKey) keys.push('Alt');
    if (shortcut.shiftKey) keys.push('⇧');
    keys.push(shortcut.key.toUpperCase());
    
    return keys.join(' + ');
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Keyboard Shortcuts"
      description="Available keyboard shortcuts for faster navigation"
      size="lg"
    >
      <div className="space-y-6">
        {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
          <div key={category}>
            <h3 className="text-lg font-medium text-gray-900 mb-3">{category}</h3>
            <div className="space-y-2">
              {categoryShortcuts.map((shortcut, index) => (
                <div
                  key={`${category}-${index}`}
                  className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-md"
                >
                  <span className="text-gray-700">{shortcut.description}</span>
                  <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded shadow-sm">
                    {formatShortcut(shortcut)}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
        
        {Object.keys(groupedShortcuts).length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No keyboard shortcuts available
          </div>
        )}
      </div>
    </AccessibleModal>
  );
};

// Hook for keyboard shortcuts help modal
export const useKeyboardShortcutsHelp = (shortcuts: KeyboardShortcut[]) => {
  const { isOpen, openModal, closeModal } = useModal();

  // Add help shortcut
  const helpShortcuts: KeyboardShortcut[] = [
    {
      key: '?',
      description: 'Show keyboard shortcuts help',
      action: openModal,
      category: 'Help'
    },
    {
      key: 'Escape',
      description: 'Close help modal',
      action: closeModal,
      category: 'Help'
    }
  ];

  useKeyboardShortcuts([...shortcuts, ...helpShortcuts]);

  return {
    isHelpOpen: isOpen,
    openHelp: openModal,
    closeHelp: closeModal,
    HelpModal: () => (
      <KeyboardShortcutsHelp
        shortcuts={shortcuts}
        isOpen={isOpen}
        onClose={closeModal}
      />
    )
  };
};

// Predefined common shortcuts
export const CommonShortcuts = {
  // Navigation
  goHome: (action: () => void): KeyboardShortcut => ({
    key: 'h',
    altKey: true,
    description: 'Go to home page',
    action,
    category: 'Navigation'
  }),

  goBack: (action: () => void): KeyboardShortcut => ({
    key: 'ArrowLeft',
    altKey: true,
    description: 'Go back',
    action,
    category: 'Navigation'
  }),

  goForward: (action: () => void): KeyboardShortcut => ({
    key: 'ArrowRight',
    altKey: true,
    description: 'Go forward',
    action,
    category: 'Navigation'
  }),

  // Actions
  save: (action: () => void): KeyboardShortcut => ({
    key: 's',
    ctrlKey: true,
    description: 'Save',
    action,
    category: 'Actions'
  }),

  refresh: (action: () => void): KeyboardShortcut => ({
    key: 'r',
    ctrlKey: true,
    description: 'Refresh',
    action,
    category: 'Actions'
  }),

  search: (action: () => void): KeyboardShortcut => ({
    key: 'k',
    ctrlKey: true,
    description: 'Search',
    action,
    category: 'Actions'
  }),

  // Modal/Dialog
  closeModal: (action: () => void): KeyboardShortcut => ({
    key: 'Escape',
    description: 'Close modal/dialog',
    action,
    category: 'Modal'
  }),

  // File operations
  upload: (action: () => void): KeyboardShortcut => ({
    key: 'u',
    ctrlKey: true,
    description: 'Upload files',
    action,
    category: 'File Operations'
  }),

  selectAll: (action: () => void): KeyboardShortcut => ({
    key: 'a',
    ctrlKey: true,
    description: 'Select all',
    action,
    category: 'Selection'
  }),

  // WhatsApp specific
  sendMessage: (action: () => void): KeyboardShortcut => ({
    key: 'Enter',
    ctrlKey: true,
    description: 'Send message',
    action,
    category: 'WhatsApp'
  }),

  openSettings: (action: () => void): KeyboardShortcut => ({
    key: ',',
    ctrlKey: true,
    description: 'Open settings',
    action,
    category: 'Application'
  }),
};

// Visual indicator for keyboard shortcut
export interface KeyboardShortcutIndicatorProps {
  shortcut: KeyboardShortcut;
  className?: string;
}

export const KeyboardShortcutIndicator: React.FC<KeyboardShortcutIndicatorProps> = ({
  shortcut,
  className
}) => {
  const formatShortcut = (shortcut: KeyboardShortcut) => {
    const keys: string[] = [];
    
    if (shortcut.metaKey) keys.push('⌘');
    if (shortcut.ctrlKey) keys.push('Ctrl');
    if (shortcut.altKey) keys.push('Alt');
    if (shortcut.shiftKey) keys.push('⇧');
    keys.push(shortcut.key.toUpperCase());
    
    return keys.join(' + ');
  };

  return (
    <kbd className={cn(
      'px-2 py-1 text-xs font-mono text-gray-600 bg-gray-100 border border-gray-300 rounded shadow-sm',
      className
    )}>
      {formatShortcut(shortcut)}
    </kbd>
  );
};
