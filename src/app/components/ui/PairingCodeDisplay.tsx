'use client';

import { useState, useEffect } from 'react';
import { Button } from './Button';
import { AccessibleModal } from './AccessibleModal';

interface PairingCodeDisplayProps {
  isOpen: boolean;
  onClose: () => void;
  pairingCode: string;
  phoneNumber?: string;
}

export function PairingCodeDisplay({ 
  isOpen, 
  onClose, 
  pairingCode, 
  phoneNumber 
}: PairingCodeDisplayProps) {
  const [timeRemaining, setTimeRemaining] = useState(120); // 2 minutes
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleClose = () => {
    setTimeRemaining(120);
    setCopied(false);
    onClose();
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Pairing Code Generated"
      className="max-w-md"
    >
      <div className="space-y-6">
        <div className="text-center">
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6">
            <div className="text-3xl font-mono font-bold text-gray-900 tracking-widest">
              {pairingCode}
            </div>
            {phoneNumber && (
              <p className="text-sm text-gray-600 mt-2">
                For phone number: {phoneNumber}
              </p>
            )}
          </div>
          
          <div className="mt-4 flex items-center justify-center space-x-2">
            <div className={`text-sm ${timeRemaining > 30 ? 'text-gray-600' : 'text-red-600'}`}>
              Expires in: {formatTime(timeRemaining)}
            </div>
            {timeRemaining <= 30 && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                Expires soon!
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleCopy}
            variant="outline"
            className="w-full"
            disabled={timeRemaining === 0}
          >
            {copied ? '✓ Copied!' : '📋 Copy Code'}
          </Button>

          <Button
            onClick={handleClose}
            className="w-full"
          >
            Done
          </Button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">Next steps:</h4>
          <ol className="text-sm text-blue-800 space-y-1">
            <li>1. Open WhatsApp on your phone</li>
            <li>2. Go to Settings → Linked Devices</li>
            <li>3. Tap "Link a Device"</li>
            <li>4. Select "Link with phone number instead"</li>
            <li>5. Enter this code: <span className="font-mono font-bold">{pairingCode}</span></li>
          </ol>
        </div>

        {timeRemaining === 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-600">
              This pairing code has expired. Please generate a new one.
            </p>
          </div>
        )}
      </div>
    </AccessibleModal>
  );
}
