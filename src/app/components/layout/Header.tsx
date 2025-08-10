'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '../ui/Button';
import { ConnectionStatus } from '../ui/ConnectionStatus';
import { cn } from '@/lib/utils/cn';

interface HeaderProps {
  className?: string;
  onMenuToggle?: () => void;
  showMenuButton?: boolean;
}

export function Header({ className, onMenuToggle, showMenuButton = false }: HeaderProps) {
  return (
    <header className={cn(
      'bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between',
      className
    )}>
      <div className="flex items-center space-x-4">
        {showMenuButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuToggle}
            className="lg:hidden"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </Button>
        )}
        
        <Link href="/" className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-semibold text-gray-900">
              WhatsApp Status Handler
            </h1>
            <p className="text-xs text-gray-500">Send media without compression</p>
          </div>
        </Link>
      </div>

      <div className="flex items-center space-x-4">
        <ConnectionStatus showDetails className="hidden md:flex" />
        
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </Button>
        </div>
      </div>
    </header>
  );
}
