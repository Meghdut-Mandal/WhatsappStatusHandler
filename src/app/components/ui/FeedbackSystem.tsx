/**
 * User Feedback and Support System
 * Week 4 - Developer C Implementation
 */

'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import { AccessibleModal, useModal } from './AccessibleModal';
import { AnimatedButton } from './AnimatedButton';
import { announceToScreenReader } from '@/lib/utils/accessibility';

export interface FeedbackData {
  type: 'bug' | 'feature' | 'general' | 'compliment';
  title: string;
  description: string;
  email?: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
  attachScreenshot?: boolean;
  userAgent: string;
  url: string;
  timestamp: Date;
}

export interface FeedbackSystemProps {
  onSubmit: (feedback: FeedbackData) => Promise<boolean>;
  categories: string[];
  className?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

export const FeedbackSystem: React.FC<FeedbackSystemProps> = ({
  onSubmit,
  categories = ['General', 'Upload', 'WhatsApp Connection', 'UI/UX', 'Performance'],
  className,
  position = 'bottom-right'
}) => {
  const { isOpen, openModal, closeModal } = useModal();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    type: 'general' as FeedbackData['type'],
    title: '',
    description: '',
    email: '',
    priority: 'medium' as FeedbackData['priority'],
    category: categories[0],
    attachScreenshot: false
  });

  const positions = {
    'bottom-right': 'fixed bottom-4 right-4 z-40',
    'bottom-left': 'fixed bottom-4 left-4 z-40',
    'top-right': 'fixed top-4 right-4 z-40',
    'top-left': 'fixed top-4 left-4 z-40'
  };

  const handleInputChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.description.trim()) {
      announceToScreenReader('Please fill in all required fields', 'assertive');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const feedbackData: FeedbackData = {
        ...formData,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date()
      };

      const success = await onSubmit(feedbackData);
      
      if (success) {
        setIsSuccess(true);
        announceToScreenReader('Feedback submitted successfully. Thank you!', 'polite');
        
        // Reset form
        setFormData({
          type: 'general',
          title: '',
          description: '',
          email: '',
          priority: 'medium',
          category: categories[0],
          attachScreenshot: false
        });
        
        // Close modal after delay
        setTimeout(() => {
          closeModal();
          setIsSuccess(false);
        }, 2000);
      } else {
        announceToScreenReader('Failed to submit feedback. Please try again.', 'assertive');
      }
    } catch (error) {
      console.error('Feedback submission error:', error);
      announceToScreenReader('An error occurred while submitting feedback.', 'assertive');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, onSubmit, categories, closeModal]);

  const typeIcons = {
    bug: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10m0 0v8a2 2 0 01-2 2H9a2 2 0 01-2-2V8m5 0V6a2 2 0 00-2-2H9a2 2 0 00-2 2v2m5 0V6a2 2 0 012-2h2a2 2 0 012 2v2" />
      </svg>
    ),
    feature: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    general: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    compliment: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    )
  };

  if (isSuccess) {
    return (
      <AccessibleModal
        isOpen={isOpen}
        onClose={closeModal}
        title="Thank You!"
        description="Your feedback has been submitted successfully"
        size="sm"
      >
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Feedback Submitted!
          </h3>
          <p className="text-gray-600">
            Thank you for helping us improve. We'll review your feedback and get back to you if needed.
          </p>
        </div>
      </AccessibleModal>
    );
  }

  return (
    <>
      {/* Feedback trigger button */}
      <div className={cn(positions[position], className)}>
        <AnimatedButton
          onClick={openModal}
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
          size="sm"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          }
          aria-label="Send feedback"
        >
          Feedback
        </AnimatedButton>
      </div>

      {/* Feedback modal */}
      <AccessibleModal
        isOpen={isOpen}
        onClose={closeModal}
        title="Send Feedback"
        description="Help us improve by sharing your thoughts, reporting bugs, or suggesting features"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Feedback type */}
          <div>
            <fieldset>
              <legend className="text-sm font-medium text-gray-900 mb-3">
                What type of feedback is this?
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {(['bug', 'feature', 'general', 'compliment'] as const).map((type) => (
                  <label
                    key={type}
                    className={cn(
                      'relative flex items-center p-3 border rounded-lg cursor-pointer',
                      'focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2',
                      formData.type === type
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <input
                      type="radio"
                      name="feedback-type"
                      value={type}
                      checked={formData.type === type}
                      onChange={(e) => handleInputChange('type', e.target.value)}
                      className="sr-only"
                    />
                    <div className={cn(
                      'mr-3',
                      formData.type === type ? 'text-blue-600' : 'text-gray-400'
                    )}>
                      {typeIcons[type]}
                    </div>
                    <span className="text-sm font-medium text-gray-900 capitalize">
                      {type === 'bug' ? 'Bug Report' : 
                       type === 'feature' ? 'Feature Request' :
                       type === 'general' ? 'General Feedback' :
                       'Compliment'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="feedback-title" className="block text-sm font-medium text-gray-900 mb-2">
              Title <span className="text-red-500" aria-label="required">*</span>
            </label>
            <input
              id="feedback-title"
              type="text"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="Brief summary of your feedback"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-describedby="title-help"
            />
            <p id="title-help" className="mt-1 text-xs text-gray-600">
              Keep it short and descriptive
            </p>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="feedback-description" className="block text-sm font-medium text-gray-900 mb-2">
              Description <span className="text-red-500" aria-label="required">*</span>
            </label>
            <textarea
              id="feedback-description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Please provide detailed information about your feedback..."
              required
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-describedby="description-help"
            />
            <p id="description-help" className="mt-1 text-xs text-gray-600">
              {formData.type === 'bug' 
                ? 'Include steps to reproduce the issue and what you expected to happen'
                : formData.type === 'feature'
                ? 'Describe the feature you\'d like and how it would help you'
                : 'Share your thoughts, suggestions, or experiences'}
            </p>
          </div>

          {/* Category and Priority */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="feedback-category" className="block text-sm font-medium text-gray-900 mb-2">
                Category
              </label>
              <select
                id="feedback-category"
                value={formData.category}
                onChange={(e) => handleInputChange('category', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="feedback-priority" className="block text-sm font-medium text-gray-900 mb-2">
                Priority
              </label>
              <select
                id="feedback-priority"
                value={formData.priority}
                onChange={(e) => handleInputChange('priority', e.target.value as FeedbackData['priority'])}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="feedback-email" className="block text-sm font-medium text-gray-900 mb-2">
              Email (optional)
            </label>
            <input
              id="feedback-email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="your.email@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-describedby="email-help"
            />
            <p id="email-help" className="mt-1 text-xs text-gray-600">
              Provide your email if you'd like us to follow up with you
            </p>
          </div>

          {/* Screenshot option */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.attachScreenshot}
                onChange={(e) => handleInputChange('attachScreenshot', e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-900">
                Include a screenshot of the current page
              </span>
            </label>
            <p className="mt-1 text-xs text-gray-600 ml-6">
              This helps us understand the context of your feedback
            </p>
          </div>

          {/* Submit buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <AnimatedButton
              type="button"
              variant="outline"
              onClick={closeModal}
              disabled={isSubmitting}
            >
              Cancel
            </AnimatedButton>
            <AnimatedButton
              type="submit"
              variant="primary"
              loading={isSubmitting}
              disabled={isSubmitting || !formData.title.trim() || !formData.description.trim()}
            >
              Send Feedback
            </AnimatedButton>
          </div>
        </form>
      </AccessibleModal>
    </>
  );
};

// Quick feedback buttons for common actions
export interface QuickFeedbackProps {
  onFeedback: (type: 'thumbs-up' | 'thumbs-down', context?: string) => void;
  context?: string;
  className?: string;
}

export const QuickFeedback: React.FC<QuickFeedbackProps> = ({
  onFeedback,
  context,
  className
}) => {
  const [voted, setVoted] = useState<'up' | 'down' | null>(null);

  const handleVote = useCallback((type: 'thumbs-up' | 'thumbs-down') => {
    const voteType = type === 'thumbs-up' ? 'up' : 'down';
    setVoted(voteType);
    onFeedback(type, context);
    
    const message = type === 'thumbs-up' 
      ? 'Thank you for the positive feedback!'
      : 'Thank you for the feedback. We\'ll work on improving this.';
    
    announceToScreenReader(message, 'polite');
  }, [onFeedback, context]);

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <span className="text-sm text-gray-600">Was this helpful?</span>
      <button
        onClick={() => handleVote('thumbs-up')}
        disabled={voted !== null}
        className={cn(
          'p-2 rounded-md transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          voted === 'up'
            ? 'text-green-600 bg-green-50'
            : 'text-gray-400 hover:text-green-600 hover:bg-green-50',
          voted !== null && 'cursor-not-allowed opacity-50'
        )}
        aria-label="This was helpful"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
        </svg>
      </button>
      <button
        onClick={() => handleVote('thumbs-down')}
        disabled={voted !== null}
        className={cn(
          'p-2 rounded-md transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          voted === 'down'
            ? 'text-red-600 bg-red-50'
            : 'text-gray-400 hover:text-red-600 hover:bg-red-50',
          voted !== null && 'cursor-not-allowed opacity-50'
        )}
        aria-label="This was not helpful"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v2a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
        </svg>
      </button>
      {voted && (
        <span className="text-sm text-gray-600 ml-2">
          Thank you!
        </span>
      )}
    </div>
  );
};
