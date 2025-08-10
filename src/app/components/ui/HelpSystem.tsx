/**
 * Help Documentation and Support System
 * Week 4 - Developer C Implementation
 */

'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import { AccessibleModal, useModal } from './AccessibleModal';
import { AnimatedButton } from './AnimatedButton';

export interface HelpArticle {
  id: string;
  title: string;
  content: React.ReactNode;
  category: string;
  tags: string[];
  lastUpdated: Date;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

export interface HelpCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  articles: HelpArticle[];
}

export interface HelpSystemProps {
  categories: HelpCategory[];
  searchable?: boolean;
  className?: string;
}

export const HelpSystem: React.FC<HelpSystemProps> = ({
  categories,
  searchable = true,
  className
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { isOpen, openModal, closeModal } = useModal();

  // Filter articles based on search query
  const filteredCategories = categories.map(category => ({
    ...category,
    articles: category.articles.filter(article =>
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
      article.content?.toString().toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(category => category.articles.length > 0 || searchQuery === '');

  const handleCategorySelect = useCallback((categoryId: string) => {
    setSelectedCategory(categoryId);
    setSelectedArticle(null);
  }, []);

  const handleArticleSelect = useCallback((article: HelpArticle) => {
    setSelectedArticle(article);
  }, []);

  const handleBack = useCallback(() => {
    if (selectedArticle) {
      setSelectedArticle(null);
    } else if (selectedCategory) {
      setSelectedCategory(null);
    }
  }, [selectedArticle, selectedCategory]);

  const currentCategory = selectedCategory 
    ? filteredCategories.find(cat => cat.id === selectedCategory)
    : null;

  return (
    <>
      <AnimatedButton
        onClick={openModal}
        variant="outline"
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        className={className}
        aria-label="Open help documentation"
      >
        Help
      </AnimatedButton>

      <AccessibleModal
        isOpen={isOpen}
        onClose={closeModal}
        title="Help & Documentation"
        description="Find answers to common questions and learn how to use the app"
        size="xl"
      >
        <div className="flex h-96">
          {/* Navigation */}
          <div className="w-1/3 border-r border-gray-200 pr-4">
            {/* Search */}
            {searchable && (
              <div className="mb-4">
                <label htmlFor="help-search" className="sr-only">
                  Search help articles
                </label>
                <div className="relative">
                  <input
                    id="help-search"
                    type="text"
                    placeholder="Search help articles..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-describedby="search-description"
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                <p id="search-description" className="sr-only">
                  Type to search through help articles and documentation
                </p>
              </div>
            )}

            {/* Back button */}
            {(selectedCategory || selectedArticle) && (
              <button
                onClick={handleBack}
                className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                aria-label="Go back to previous section"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            )}

            {/* Categories or Articles */}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {!selectedCategory ? (
                // Show categories
                filteredCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => handleCategorySelect(category.id)}
                    className={cn(
                      'w-full text-left p-3 rounded-md transition-colors',
                      'hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                      'border border-gray-200'
                    )}
                    aria-describedby={`category-${category.id}-desc`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="text-blue-600">{category.icon}</div>
                      <div>
                        <h3 className="font-medium text-gray-900">{category.name}</h3>
                        <p id={`category-${category.id}-desc`} className="text-sm text-gray-600">
                          {category.description}
                        </p>
                        <span className="text-xs text-gray-500">
                          {category.articles.length} articles
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                // Show articles in selected category
                currentCategory?.articles.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => handleArticleSelect(article)}
                    className={cn(
                      'w-full text-left p-3 rounded-md transition-colors',
                      'hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                      'border border-gray-200',
                      selectedArticle?.id === article.id && 'bg-blue-50 border-blue-200'
                    )}
                  >
                    <h4 className="font-medium text-gray-900 mb-1">{article.title}</h4>
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      {article.difficulty && (
                        <span className={cn(
                          'px-2 py-1 rounded-full',
                          article.difficulty === 'beginner' && 'bg-green-100 text-green-800',
                          article.difficulty === 'intermediate' && 'bg-yellow-100 text-yellow-800',
                          article.difficulty === 'advanced' && 'bg-red-100 text-red-800'
                        )}>
                          {article.difficulty}
                        </span>
                      )}
                      <span>Updated {article.lastUpdated.toLocaleDateString()}</span>
                    </div>
                  </button>
                ))
              )}

              {filteredCategories.length === 0 && searchQuery && (
                <div className="text-center py-8 text-gray-500">
                  <p>No articles found for &quot;{searchQuery}&quot;</p>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-blue-600 hover:text-blue-800 text-sm mt-2 focus:outline-none focus:underline"
                  >
                    Clear search
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 pl-6">
            {selectedArticle ? (
              <div>
                <header className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    {selectedArticle.title}
                  </h2>
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <span>Category: {currentCategory?.name}</span>
                    {selectedArticle.difficulty && (
                      <span className={cn(
                        'px-2 py-1 rounded-full text-xs',
                        selectedArticle.difficulty === 'beginner' && 'bg-green-100 text-green-800',
                        selectedArticle.difficulty === 'intermediate' && 'bg-yellow-100 text-yellow-800',
                        selectedArticle.difficulty === 'advanced' && 'bg-red-100 text-red-800'
                      )}>
                        {selectedArticle.difficulty}
                      </span>
                    )}
                    <span>Updated {selectedArticle.lastUpdated.toLocaleDateString()}</span>
                  </div>
                </header>
                
                <div className="prose prose-sm max-w-none">
                  {selectedArticle.content}
                </div>
                
                {selectedArticle.tags.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <h3 className="text-sm font-medium text-gray-900 mb-2">Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedArticle.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : selectedCategory ? (
              <div>
                <header className="mb-6">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="text-blue-600">{currentCategory?.icon}</div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {currentCategory?.name}
                    </h2>
                  </div>
                  <p className="text-gray-600">{currentCategory?.description}</p>
                </header>
                
                <div className="text-gray-600">
                  <p>Select an article from the sidebar to view its content.</p>
                  <p className="mt-2 text-sm">
                    This category contains {currentCategory?.articles.length} articles.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Welcome to Help & Documentation
                  </h3>
                  <p className="text-gray-600 max-w-md">
                    Select a category from the sidebar to browse help articles, or use the search box to find specific topics.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </AccessibleModal>
    </>
  );
};

// Predefined help articles for WhatsApp Status Handler
export const createWhatsAppHelpContent = (): HelpCategory[] => [
  {
    id: 'getting-started',
    name: 'Getting Started',
    description: 'Learn the basics of using WhatsApp Status Handler',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    articles: [
      {
        id: 'first-time-setup',
        title: 'First Time Setup',
        content: (
          <div>
            <h3>Setting up WhatsApp Status Handler</h3>
            <ol>
              <li><strong>Connect your WhatsApp:</strong> Click the &quot;Connect WhatsApp&quot; button and scan the QR code with your phone.</li>
              <li><strong>Upload media:</strong> Drag and drop or select files to upload.</li>
              <li><strong>Send to Status:</strong> Choose your uploaded files and send them to your WhatsApp Status.</li>
            </ol>
            <p>The app preserves original quality, so your photos and videos won&apos;t be compressed.</p>
          </div>
        ),
        category: 'getting-started',
        tags: ['setup', 'first-time', 'basics'],
        lastUpdated: new Date(),
        difficulty: 'beginner'
      },
      {
        id: 'connecting-whatsapp',
        title: 'Connecting Your WhatsApp Account',
        content: (
          <div>
            <h3>How to connect WhatsApp</h3>
            <p>To use this app, you need to connect your WhatsApp account:</p>
            <ol>
              <li>Make sure WhatsApp is installed on your phone</li>
              <li>Click &quot;Connect WhatsApp&quot; in the app</li>
              <li>A QR code will appear on your screen</li>
              <li>Open WhatsApp on your phone</li>
              <li>Go to Settings → Linked Devices → Link a Device</li>
              <li>Scan the QR code displayed in the app</li>
            </ol>
            <p><strong>Note:</strong> Your phone needs to stay connected to the internet for the app to work.</p>
          </div>
        ),
        category: 'getting-started',
        tags: ['whatsapp', 'connection', 'qr-code'],
        lastUpdated: new Date(),
        difficulty: 'beginner'
      }
    ]
  },
  {
    id: 'file-management',
    name: 'File Management',
    description: 'Learn how to upload, manage, and organize your files',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
    articles: [
      {
        id: 'supported-formats',
        title: 'Supported File Formats',
        content: (
          <div>
            <h3>What file types can I upload?</h3>
            <h4>Images:</h4>
            <ul>
              <li>JPEG (.jpg, .jpeg)</li>
              <li>PNG (.png)</li>
              <li>GIF (.gif)</li>
              <li>WebP (.webp)</li>
            </ul>
            <h4>Videos:</h4>
            <ul>
              <li>MP4 (.mp4)</li>
              <li>MOV (.mov)</li>
              <li>AVI (.avi)</li>
              <li>WebM (.webm)</li>
            </ul>
            <p><strong>File size limits:</strong> WhatsApp has a 16MB limit for media files. Larger files will be sent as documents.</p>
          </div>
        ),
        category: 'file-management',
        tags: ['formats', 'upload', 'limits'],
        lastUpdated: new Date(),
        difficulty: 'beginner'
      }
    ]
  },
  {
    id: 'troubleshooting',
    name: 'Troubleshooting',
    description: 'Common issues and how to solve them',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      </svg>
    ),
    articles: [
      {
        id: 'connection-issues',
        title: 'Connection Issues',
        content: (
          <div>
            <h3>WhatsApp won&apos;t connect</h3>
            <p>If you&apos;re having trouble connecting WhatsApp, try these steps:</p>
            <ol>
              <li><strong>Check your internet connection</strong> - Both your computer and phone need internet access</li>
              <li><strong>Refresh the QR code</strong> - Click the refresh button to generate a new QR code</li>
              <li><strong>Check WhatsApp version</strong> - Make sure you have the latest version of WhatsApp on your phone</li>
              <li><strong>Clear browser cache</strong> - Try clearing your browser cache and cookies</li>
              <li><strong>Try a different browser</strong> - Some browsers work better than others</li>
            </ol>
            <p>If none of these work, try restarting both your phone and computer.</p>
          </div>
        ),
        category: 'troubleshooting',
        tags: ['connection', 'qr-code', 'internet'],
        lastUpdated: new Date(),
        difficulty: 'intermediate'
      }
    ]
  }
];
