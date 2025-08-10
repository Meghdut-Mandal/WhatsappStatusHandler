/**
 * Accessible Modal Component with Focus Management
 * Week 4 - Developer C Implementation
 */

'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils/cn';

export interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  children: React.ReactNode;
  className?: string;
  overlayClassName?: string;
  preventScroll?: boolean;
  initialFocus?: React.RefObject<HTMLElement>;
  finalFocus?: React.RefObject<HTMLElement>;
}

export const AccessibleModal: React.FC<AccessibleModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  children,
  className,
  overlayClassName,
  preventScroll = true,
  initialFocus,
  finalFocus,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const [mounted, setMounted] = useState(false);

  // Track focusable elements
  const focusableElementsSelector = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable]:not([contenteditable="false"])',
  ].join(', ');

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4'
  };

  // Get focusable elements within modal
  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return [];
    return Array.from(modalRef.current.querySelectorAll(focusableElementsSelector));
  }, [focusableElementsSelector]);

  // Focus management
  const focusFirstElement = useCallback(() => {
    if (initialFocus?.current) {
      initialFocus.current.focus();
      return;
    }

    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus();
    } else {
      modalRef.current?.focus();
    }
  }, [initialFocus, getFocusableElements]);

  const focusLastElement = useCallback(() => {
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      (focusableElements[focusableElements.length - 1] as HTMLElement).focus();
    }
  }, [getFocusableElements]);

  // Handle tab key for focus trapping
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return;

    if (event.key === 'Escape' && closeOnEscape) {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'Tab') {
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }
  }, [isOpen, closeOnEscape, onClose, getFocusableElements]);

  // Handle overlay click
  const handleOverlayClick = useCallback((event: React.MouseEvent) => {
    if (closeOnOverlayClick && event.target === overlayRef.current) {
      onClose();
    }
  }, [closeOnOverlayClick, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (!preventScroll) return;

    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen, preventScroll]);

  // Focus management on open/close
  useEffect(() => {
    if (isOpen) {
      // Store the currently focused element
      previousActiveElement.current = document.activeElement;
      
      // Focus the modal after a brief delay to ensure it's rendered
      setTimeout(() => {
        focusFirstElement();
      }, 100);
    } else {
      // Return focus to the previously focused element
      if (finalFocus?.current) {
        finalFocus.current.focus();
      } else if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    }
  }, [isOpen, focusFirstElement, finalFocus]);

  // Add/remove event listeners
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, handleKeyDown]);

  // Handle mounting for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen) return null;

  const modalContent = (
    <div
      ref={overlayRef}
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        'bg-black bg-opacity-50 backdrop-blur-sm',
        'animate-in fade-in duration-200',
        overlayClassName
      )}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby={description ? "modal-description" : undefined}
    >
      <div
        ref={modalRef}
        className={cn(
          'relative w-full bg-white rounded-lg shadow-xl',
          'animate-in zoom-in-95 duration-200',
          'max-h-[90vh] overflow-y-auto',
          sizes[size],
          className
        )}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 id="modal-title" className="text-lg font-semibold text-gray-900">
              {title}
            </h2>
            {description && (
              <p id="modal-description" className="mt-1 text-sm text-gray-600">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className={cn(
              'p-2 text-gray-400 hover:text-gray-600 rounded-md',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
              'transition-colors duration-200'
            )}
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// Hook for managing modal state
export const useModal = (initialOpen = false) => {
  const [isOpen, setIsOpen] = useState(initialOpen);

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);
  const toggleModal = useCallback(() => setIsOpen(prev => !prev), []);

  return {
    isOpen,
    openModal,
    closeModal,
    toggleModal,
  };
};

// Confirmation modal component
export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info',
  loading = false,
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const variantStyles = {
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    warning: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
    info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
  };

  const handleConfirm = () => {
    onConfirm();
    if (!loading) {
      onClose();
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      initialFocus={confirmButtonRef as React.RefObject<HTMLElement>}
    >
      <div className="space-y-4">
        <p className="text-gray-700">{message}</p>
        
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={loading}
            className={cn(
              'px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md',
              'hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors duration-200'
            )}
          >
            {cancelText}
          </button>
          
          <button
            ref={confirmButtonRef}
            onClick={handleConfirm}
            disabled={loading}
            className={cn(
              'px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md',
              'focus:outline-none focus:ring-2 focus:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors duration-200',
              'flex items-center space-x-2',
              variantStyles[variant]
            )}
          >
            {loading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};
