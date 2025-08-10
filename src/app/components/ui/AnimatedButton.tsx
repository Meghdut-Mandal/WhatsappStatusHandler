/**
 * Animated Button Component with Enhanced Visual Feedback
 * Week 4 - Developer C Implementation
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';

export interface AnimatedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  ripple?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
}

export const AnimatedButton = React.forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  ({
    className,
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    iconPosition = 'left',
    ripple = true,
    pulse = false,
    disabled,
    onClick,
    children,
    ...props
  }, ref) => {
    const [isPressed, setIsPressed] = useState(false);
    const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const rippleId = useRef(0);

    const variants = {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white border-transparent shadow-sm hover:shadow-md',
      secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-300',
      outline: 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400',
      ghost: 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
      destructive: 'bg-red-600 hover:bg-red-700 text-white border-transparent shadow-sm hover:shadow-md'
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base'
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || loading) return;

      // Create ripple effect
      if (ripple && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const newRipple = { id: rippleId.current++, x, y };
        setRipples(prev => [...prev, newRipple]);

        // Remove ripple after animation
        setTimeout(() => {
          setRipples(prev => prev.filter(r => r.id !== newRipple.id));
        }, 600);
      }

      // Press animation
      setIsPressed(true);
      setTimeout(() => setIsPressed(false), 150);

      onClick?.(e);
    };

    // Keyboard interaction
    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ' || e.key === 'Enter') {
        setIsPressed(true);
      }
    };

    const handleKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ' || e.key === 'Enter') {
        setIsPressed(false);
      }
    };

    // Focus management
    useEffect(() => {
      const button = buttonRef.current;
      if (!button) return;

      const handleFocusIn = () => {
        button.setAttribute('data-focused', 'true');
      };

      const handleFocusOut = () => {
        button.removeAttribute('data-focused');
        setIsPressed(false);
      };

      button.addEventListener('focusin', handleFocusIn);
      button.addEventListener('focusout', handleFocusOut);

      return () => {
        button.removeEventListener('focusin', handleFocusIn);
        button.removeEventListener('focusout', handleFocusOut);
      };
    }, []);

    return (
      <button
        ref={(node) => {
          buttonRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        className={cn(
          // Base styles
          'relative inline-flex items-center justify-center font-medium border rounded-md',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          'transition-all duration-200 ease-in-out',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
          'select-none overflow-hidden',
          
          // Variant styles
          variants[variant],
          
          // Size styles
          sizes[size],
          
          // Animation states
          isPressed && 'transform scale-95',
          pulse && !disabled && !loading && 'animate-pulse',
          
          // Focus styles
          'data-[focused]:ring-2 data-[focused]:ring-blue-500 data-[focused]:ring-offset-2',
          
          className
        )}
        disabled={disabled || loading}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        aria-disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {/* Ripple effects */}
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="absolute pointer-events-none"
            style={{
              left: ripple.x,
              top: ripple.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span
              className={cn(
                'block w-0 h-0 rounded-full',
                'animate-[ripple_0.6s_ease-out]',
                variant === 'primary' || variant === 'destructive' 
                  ? 'bg-white/30' 
                  : 'bg-gray-400/30'
              )}
              style={{
                animationFillMode: 'forwards',
              }}
            />
          </span>
        ))}

        {/* Loading spinner */}
        {loading && (
          <svg
            className={cn(
              'animate-spin mr-2',
              size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'
            )}
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}

        {/* Left icon */}
        {icon && iconPosition === 'left' && !loading && (
          <span className={cn('mr-2', size === 'sm' ? 'text-xs' : 'text-sm')}>
            {icon}
          </span>
        )}

        {/* Button content */}
        <span className={cn(loading && 'opacity-0')}>{children}</span>

        {/* Right icon */}
        {icon && iconPosition === 'right' && !loading && (
          <span className={cn('ml-2', size === 'sm' ? 'text-xs' : 'text-sm')}>
            {icon}
          </span>
        )}
      </button>
    );
  }
);

AnimatedButton.displayName = 'AnimatedButton';

// Add custom animation to global CSS
const rippleKeyframes = `
  @keyframes ripple {
    to {
      width: 100px;
      height: 100px;
      opacity: 0;
    }
  }
`;

// Inject styles if not already present
if (typeof document !== 'undefined' && !document.getElementById('animated-button-styles')) {
  const style = document.createElement('style');
  style.id = 'animated-button-styles';
  style.textContent = rippleKeyframes;
  document.head.appendChild(style);
}
