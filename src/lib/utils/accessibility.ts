/**
 * Accessibility Utilities and Helpers
 * Week 4 - Developer C Implementation
 */

// Screen reader utilities
export const announceToScreenReader = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
  if (typeof window === 'undefined') return;

  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.setAttribute('class', 'sr-only');
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

// Focus management
export const trapFocus = (element: HTMLElement) => {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  
  const firstFocusable = focusableElements[0] as HTMLElement;
  const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    }
  };

  element.addEventListener('keydown', handleKeyDown);
  
  // Focus first element
  if (firstFocusable) {
    firstFocusable.focus();
  }

  return () => {
    element.removeEventListener('keydown', handleKeyDown);
  };
};

// ARIA utilities
export const generateId = (prefix = 'element') => {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
};

export const getAriaProps = (options: {
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  expanded?: boolean;
  selected?: boolean;
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  hidden?: boolean;
  role?: string;
  live?: 'polite' | 'assertive' | 'off';
}) => {
  const props: Record<string, any> = {};

  if (options.label) props['aria-label'] = options.label;
  if (options.labelledBy) props['aria-labelledby'] = options.labelledBy;
  if (options.describedBy) props['aria-describedby'] = options.describedBy;
  if (options.expanded !== undefined) props['aria-expanded'] = options.expanded;
  if (options.selected !== undefined) props['aria-selected'] = options.selected;
  if (options.checked !== undefined) props['aria-checked'] = options.checked;
  if (options.disabled) props['aria-disabled'] = true;
  if (options.required) props['aria-required'] = true;
  if (options.invalid) props['aria-invalid'] = true;
  if (options.hidden) props['aria-hidden'] = true;
  if (options.role) props['role'] = options.role;
  if (options.live) props['aria-live'] = options.live;

  return props;
};

// Keyboard navigation helpers
export const isNavigationKey = (key: string) => {
  return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key);
};

export const isActionKey = (key: string) => {
  return ['Enter', ' ', 'Space'].includes(key);
};

export const handleListNavigation = (
  event: KeyboardEvent,
  items: HTMLElement[],
  currentIndex: number,
  onIndexChange: (index: number) => void,
  options: {
    wrap?: boolean;
    orientation?: 'horizontal' | 'vertical' | 'both';
  } = {}
) => {
  const { wrap = true, orientation = 'vertical' } = options;
  let newIndex = currentIndex;

  switch (event.key) {
    case 'ArrowUp':
      if (orientation === 'vertical' || orientation === 'both') {
        event.preventDefault();
        newIndex = currentIndex > 0 ? currentIndex - 1 : wrap ? items.length - 1 : currentIndex;
      }
      break;
    case 'ArrowDown':
      if (orientation === 'vertical' || orientation === 'both') {
        event.preventDefault();
        newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : wrap ? 0 : currentIndex;
      }
      break;
    case 'ArrowLeft':
      if (orientation === 'horizontal' || orientation === 'both') {
        event.preventDefault();
        newIndex = currentIndex > 0 ? currentIndex - 1 : wrap ? items.length - 1 : currentIndex;
      }
      break;
    case 'ArrowRight':
      if (orientation === 'horizontal' || orientation === 'both') {
        event.preventDefault();
        newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : wrap ? 0 : currentIndex;
      }
      break;
    case 'Home':
      event.preventDefault();
      newIndex = 0;
      break;
    case 'End':
      event.preventDefault();
      newIndex = items.length - 1;
      break;
  }

  if (newIndex !== currentIndex) {
    onIndexChange(newIndex);
    items[newIndex]?.focus();
  }
};

// Color contrast utilities
export const getContrastRatio = (color1: string, color2: string): number => {
  const getLuminance = (color: string): number => {
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;

    // Calculate relative luminance
    const sRGB = [r, g, b].map(c => {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  };

  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);

  return (brightest + 0.05) / (darkest + 0.05);
};

export const meetsWCAGContrast = (
  color1: string, 
  color2: string, 
  level: 'AA' | 'AAA' = 'AA',
  size: 'normal' | 'large' = 'normal'
): boolean => {
  const ratio = getContrastRatio(color1, color2);
  
  if (level === 'AAA') {
    return size === 'large' ? ratio >= 4.5 : ratio >= 7;
  } else {
    return size === 'large' ? ratio >= 3 : ratio >= 4.5;
  }
};

// Reduced motion utilities
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export const respectMotionPreference = <T>(
  normalValue: T,
  reducedValue: T
): T => {
  return prefersReducedMotion() ? reducedValue : normalValue;
};

// High contrast mode detection
export const isHighContrastMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: high)').matches;
};

// Font size preferences
export const getFontSizePreference = (): 'small' | 'normal' | 'large' => {
  if (typeof window === 'undefined') return 'normal';
  
  const fontSize = window.getComputedStyle(document.documentElement).fontSize;
  const baseFontSize = parseFloat(fontSize);
  
  if (baseFontSize >= 20) return 'large';
  if (baseFontSize <= 14) return 'small';
  return 'normal';
};

// Touch/pointer utilities
export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

export const getPointerType = (): 'mouse' | 'touch' | 'pen' | 'unknown' => {
  if (typeof window === 'undefined') return 'unknown';
  
  if (window.matchMedia('(pointer: coarse)').matches) return 'touch';
  if (window.matchMedia('(pointer: fine)').matches) return 'mouse';
  return 'unknown';
};

// Skip link utilities
export const createSkipLink = (targetId: string, text = 'Skip to main content') => {
  const skipLink = document.createElement('a');
  skipLink.href = `#${targetId}`;
  skipLink.textContent = text;
  skipLink.className = 'sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:p-2 focus:bg-blue-600 focus:text-white';
  
  document.body.insertBefore(skipLink, document.body.firstChild);
  
  return skipLink;
};

// Form accessibility helpers
export const associateLabel = (input: HTMLElement, label: HTMLElement) => {
  const id = input.id || generateId('input');
  input.id = id;
  label.setAttribute('for', id);
};

export const addErrorMessage = (input: HTMLElement, message: string) => {
  const errorId = generateId('error');
  const errorElement = document.createElement('div');
  errorElement.id = errorId;
  errorElement.className = 'text-red-600 text-sm mt-1';
  errorElement.textContent = message;
  errorElement.setAttribute('role', 'alert');
  
  input.setAttribute('aria-describedby', errorId);
  input.setAttribute('aria-invalid', 'true');
  input.parentNode?.appendChild(errorElement);
  
  return errorElement;
};

export const removeErrorMessage = (input: HTMLElement) => {
  const errorId = input.getAttribute('aria-describedby');
  if (errorId) {
    const errorElement = document.getElementById(errorId);
    errorElement?.remove();
    input.removeAttribute('aria-describedby');
    input.removeAttribute('aria-invalid');
  }
};

// Live region utilities
export const createLiveRegion = (
  level: 'polite' | 'assertive' = 'polite',
  atomic = false
) => {
  const region = document.createElement('div');
  region.setAttribute('aria-live', level);
  region.setAttribute('aria-atomic', atomic.toString());
  region.className = 'sr-only';
  document.body.appendChild(region);
  
  return {
    announce: (message: string) => {
      region.textContent = message;
    },
    destroy: () => {
      region.remove();
    }
  };
};

// Accessibility testing helpers (for development)
export const auditAccessibility = (element: HTMLElement) => {
  const issues: string[] = [];
  
  // Check for missing alt text on images
  const images = element.querySelectorAll('img');
  images.forEach((img, index) => {
    if (!img.alt && !img.getAttribute('aria-label')) {
      issues.push(`Image ${index + 1} is missing alt text`);
    }
  });
  
  // Check for missing form labels
  const inputs = element.querySelectorAll('input, select, textarea');
  inputs.forEach((input, index) => {
    const id = input.id;
    const hasLabel = id && document.querySelector(`label[for="${id}"]`);
    const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
    
    if (!hasLabel && !hasAriaLabel) {
      issues.push(`Form field ${index + 1} is missing a label`);
    }
  });
  
  // Check for missing headings hierarchy
  const headings = Array.from(element.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  let lastLevel = 0;
  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName.charAt(1));
    if (index === 0 && level !== 1) {
      issues.push('First heading should be h1');
    } else if (level > lastLevel + 1) {
      issues.push(`Heading level skipped at heading ${index + 1}`);
    }
    lastLevel = level;
  });
  
  // Check for missing focus indicators
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  focusableElements.forEach((el, index) => {
    const styles = window.getComputedStyle(el, ':focus');
    if (styles.outline === 'none' && !styles.boxShadow && !styles.border) {
      issues.push(`Focusable element ${index + 1} may be missing focus indicator`);
    }
  });
  
  return issues;
};

// Export commonly used ARIA roles
export const ARIA_ROLES = {
  BUTTON: 'button',
  LINK: 'link',
  TAB: 'tab',
  TABPANEL: 'tabpanel',
  TABLIST: 'tablist',
  MENU: 'menu',
  MENUITEM: 'menuitem',
  MENUBAR: 'menubar',
  DIALOG: 'dialog',
  ALERTDIALOG: 'alertdialog',
  ALERT: 'alert',
  STATUS: 'status',
  LOG: 'log',
  MARQUEE: 'marquee',
  TIMER: 'timer',
  TOOLTIP: 'tooltip',
  COMPLEMENTARY: 'complementary',
  CONTENTINFO: 'contentinfo',
  MAIN: 'main',
  NAVIGATION: 'navigation',
  BANNER: 'banner',
  REGION: 'region',
  ARTICLE: 'article',
  SECTION: 'section',
  LIST: 'list',
  LISTITEM: 'listitem',
  GRID: 'grid',
  GRIDCELL: 'gridcell',
  ROW: 'row',
  COLUMNHEADER: 'columnheader',
  ROWHEADER: 'rowheader'
} as const;
