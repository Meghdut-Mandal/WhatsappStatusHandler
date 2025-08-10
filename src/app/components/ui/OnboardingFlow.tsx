/**
 * Onboarding Flow Component
 * Week 4 - Developer C Implementation
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';
import { AnimatedButton } from './AnimatedButton';
import { AccessibleModal } from './AccessibleModal';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  content: React.ReactNode;
  skipable?: boolean;
  validation?: () => boolean | Promise<boolean>;
  onEnter?: () => void;
  onExit?: () => void;
}

export interface OnboardingFlowProps {
  steps: OnboardingStep[];
  isOpen: boolean;
  onComplete: () => void;
  onSkip?: () => void;
  onClose?: () => void;
  className?: string;
  showProgress?: boolean;
  allowSkipAll?: boolean;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  steps,
  isOpen,
  onComplete,
  onSkip,
  onClose,
  className,
  showProgress = true,
  allowSkipAll = true,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [isValidating, setIsValidating] = useState(false);

  const currentStep = steps[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  // Handle step enter/exit
  useEffect(() => {
    if (currentStep?.onEnter) {
      currentStep.onEnter();
    }

    return () => {
      if (currentStep?.onExit) {
        currentStep.onExit();
      }
    };
  }, [currentStep]);

  const handleNext = useCallback(async () => {
    if (!currentStep) return;

    // Validate current step if validation function exists
    if (currentStep.validation) {
      setIsValidating(true);
      try {
        const isValid = await currentStep.validation();
        if (!isValid) {
          setIsValidating(false);
          return;
        }
      } catch (error) {
        console.error('Step validation failed:', error);
        setIsValidating(false);
        return;
      }
      setIsValidating(false);
    }

    // Mark step as completed
    setCompletedSteps(prev => new Set(prev).add(currentStep.id));

    // Move to next step or complete
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStepIndex(prev => prev + 1);
    }
  }, [currentStep, isLastStep, onComplete]);

  const handlePrevious = useCallback(() => {
    if (!isFirstStep) {
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [isFirstStep]);

  const handleSkipStep = useCallback(() => {
    if (currentStep?.skipable) {
      if (isLastStep) {
        onComplete();
      } else {
        setCurrentStepIndex(prev => prev + 1);
      }
    }
  }, [currentStep, isLastStep, onComplete]);

  const handleSkipAll = useCallback(() => {
    if (allowSkipAll && onSkip) {
      onSkip();
    }
  }, [allowSkipAll, onSkip]);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  const progressPercentage = ((currentStepIndex + 1) / steps.length) * 100;

  if (!isOpen || !currentStep) return null;

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={handleClose || (() => {})}
      title={currentStep.title}
      description={currentStep.description}
      size="lg"
      closeOnOverlayClick={false}
      closeOnEscape={!!onClose}
      className={cn('max-w-3xl', className)}
    >
      <div className="space-y-6">
        {/* Progress bar */}
        {showProgress && (
          <div className="w-full">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">
                Step {currentStepIndex + 1} of {steps.length}
              </span>
              <span className="text-sm text-gray-500">
                {Math.round(progressPercentage)}% complete
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Step indicators */}
        <div className="flex justify-center space-x-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                'w-3 h-3 rounded-full transition-all duration-200',
                index === currentStepIndex
                  ? 'bg-blue-600 ring-2 ring-blue-200'
                  : completedSteps.has(step.id)
                  ? 'bg-green-500'
                  : index < currentStepIndex
                  ? 'bg-gray-400'
                  : 'bg-gray-200'
              )}
              aria-label={`Step ${index + 1}: ${step.title}`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[200px] flex items-center justify-center">
          <div className="w-full">
            {currentStep.content}
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
          <div className="flex space-x-3">
            {!isFirstStep && (
              <AnimatedButton
                variant="outline"
                onClick={handlePrevious}
                disabled={isValidating}
              >
                Previous
              </AnimatedButton>
            )}
            
            {allowSkipAll && (
              <AnimatedButton
                variant="ghost"
                onClick={handleSkipAll}
                disabled={isValidating}
              >
                Skip All
              </AnimatedButton>
            )}
          </div>

          <div className="flex space-x-3">
            {currentStep.skipable && (
              <AnimatedButton
                variant="outline"
                onClick={handleSkipStep}
                disabled={isValidating}
              >
                Skip
              </AnimatedButton>
            )}
            
            <AnimatedButton
              variant="primary"
              onClick={handleNext}
              loading={isValidating}
              disabled={isValidating}
            >
              {isLastStep ? 'Complete' : 'Next'}
            </AnimatedButton>
          </div>
        </div>
      </div>
    </AccessibleModal>
  );
};

// Hook for managing onboarding state
export const useOnboarding = (steps: OnboardingStep[], autoStart = false) => {
  const [isOpen, setIsOpen] = useState(autoStart);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isSkipped, setIsSkipped] = useState(false);

  const startOnboarding = useCallback(() => {
    setIsOpen(true);
    setIsCompleted(false);
    setIsSkipped(false);
  }, []);

  const completeOnboarding = useCallback(() => {
    setIsOpen(false);
    setIsCompleted(true);
  }, []);

  const skipOnboarding = useCallback(() => {
    setIsOpen(false);
    setIsSkipped(true);
  }, []);

  const closeOnboarding = useCallback(() => {
    setIsOpen(false);
  }, []);

  const resetOnboarding = useCallback(() => {
    setIsOpen(false);
    setIsCompleted(false);
    setIsSkipped(false);
  }, []);

  return {
    isOpen,
    isCompleted,
    isSkipped,
    startOnboarding,
    completeOnboarding,
    skipOnboarding,
    closeOnboarding,
    resetOnboarding,
    OnboardingComponent: () => (
      <OnboardingFlow
        steps={steps}
        isOpen={isOpen}
        onComplete={completeOnboarding}
        onSkip={skipOnboarding}
        onClose={closeOnboarding}
      />
    )
  };
};

// Predefined onboarding steps for WhatsApp Status Handler
export const createWhatsAppOnboardingSteps = (callbacks: {
  onConnectWhatsApp: () => void;
  onUploadFiles: () => void;
  onSendStatus: () => void;
}): OnboardingStep[] => [
  {
    id: 'welcome',
    title: 'Welcome to WhatsApp Status Handler',
    description: 'Let\'s get you started with sending media to WhatsApp Status',
    content: (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-900">
          Send High-Quality Media to WhatsApp Status
        </h3>
        <p className="text-gray-600 max-w-md mx-auto">
          This app helps you upload photos and videos to your WhatsApp Status without compression, 
          maintaining original quality.
        </p>
      </div>
    ),
    skipable: true
  },
  {
    id: 'connect-whatsapp',
    title: 'Connect Your WhatsApp Account',
    description: 'Scan the QR code with your phone to connect',
    content: (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01m-5.01 0H16m-2-7h2m0 0h2m0 0h2m-6 0v2m0 0V9m0 4h.01" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-900">
          Connect WhatsApp
        </h3>
        <p className="text-gray-600 max-w-md mx-auto">
          You'll need to scan a QR code with your phone to connect your WhatsApp account. 
          Make sure WhatsApp is installed on your phone.
        </p>
        <AnimatedButton onClick={callbacks.onConnectWhatsApp} variant="primary">
          Start Connection
        </AnimatedButton>
      </div>
    ),
    skipable: false
  },
  {
    id: 'upload-files',
    title: 'Upload Your Media',
    description: 'Choose photos or videos to upload',
    content: (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-900">
          Upload Your Media Files
        </h3>
        <p className="text-gray-600 max-w-md mx-auto">
          Drag and drop or click to select photos and videos. The app supports various formats 
          and will preserve the original quality.
        </p>
        <AnimatedButton onClick={callbacks.onUploadFiles} variant="primary">
          Choose Files
        </AnimatedButton>
      </div>
    ),
    skipable: true
  },
  {
    id: 'send-status',
    title: 'Send to WhatsApp Status',
    description: 'Your media is ready to be sent',
    content: (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-900">
          Send to Status
        </h3>
        <p className="text-gray-600 max-w-md mx-auto">
          Once your files are uploaded and WhatsApp is connected, you can send them to your 
          WhatsApp Status. You can also add captions if needed.
        </p>
        <AnimatedButton onClick={callbacks.onSendStatus} variant="primary">
          Send to Status
        </AnimatedButton>
      </div>
    ),
    skipable: true
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'Enjoy using WhatsApp Status Handler',
    content: (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-900">
          Congratulations!
        </h3>
        <p className="text-gray-600 max-w-md mx-auto">
          You've completed the setup. You can now upload and send high-quality media to your 
          WhatsApp Status anytime. Check out the settings for more customization options.
        </p>
        <div className="flex justify-center space-x-4">
          <AnimatedButton variant="outline">
            View Settings
          </AnimatedButton>
          <AnimatedButton variant="primary">
            Start Using App
          </AnimatedButton>
        </div>
      </div>
    ),
    skipable: false
  }
];

// Tooltip component for onboarding hints
export interface OnboardingTooltipProps {
  content: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  isVisible: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}

export const OnboardingTooltip: React.FC<OnboardingTooltipProps> = ({
  content,
  position = 'top',
  isVisible,
  onClose,
  children
}) => {
  if (!isVisible) return <>{children}</>;

  const positions = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2'
  };

  const arrows = {
    top: 'top-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-gray-900',
    bottom: 'bottom-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-gray-900',
    left: 'left-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-gray-900',
    right: 'right-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-gray-900'
  };

  return (
    <div className="relative inline-block">
      {children}
      <div className={cn(
        'absolute z-50 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg',
        'animate-in fade-in duration-200',
        positions[position]
      )}>
        {content}
        {onClose && (
          <button
            onClick={onClose}
            className="ml-2 text-white hover:text-gray-300"
            aria-label="Close tooltip"
          >
            ×
          </button>
        )}
        <div className={cn('absolute w-0 h-0 border-4', arrows[position])} />
      </div>
    </div>
  );
};
