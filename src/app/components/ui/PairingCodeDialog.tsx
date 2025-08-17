'use client';

import { useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { AccessibleModal } from './AccessibleModal';

interface PairingCodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (pairingCode: string) => void;
}

export function PairingCodeDialog({ isOpen, onClose, onSuccess }: PairingCodeDialogProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/pairing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        onSuccess(data.pairingCode);
        onClose();
      } else {
        setError(data.error || 'Failed to generate pairing code');
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('Pairing code error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPhoneNumber('');
    setError(null);
    onClose();
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Link with Phone Number"
      className="max-w-md"
    >
      <div className="space-y-4">
        <div className="text-sm text-gray-600">
          <p className="mb-2">
            Instead of scanning a QR code, you can link your device using a pairing code.
          </p>
          <p>
            Enter your phone number with country code (numbers only).
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <Input
              id="phoneNumber"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g., 1234567890 (no + or spaces)"
              disabled={loading}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Include country code. Example: 1234567890 for +1 (234) 567-890
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex space-x-3">
            <Button
              type="submit"
              disabled={loading || !phoneNumber.trim()}
              className="flex-1"
            >
              {loading ? 'Generating...' : 'Generate Pairing Code'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </form>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h4 className="font-medium text-blue-900 mb-1">How to use pairing code:</h4>
          <ol className="text-xs text-blue-800 space-y-1">
            <li>1. Open WhatsApp on your phone</li>
            <li>2. Go to Settings → Linked Devices</li>
            <li>3. Tap "Link a Device"</li>
            <li>4. Select "Link with phone number instead"</li>
            <li>5. Enter the generated pairing code</li>
          </ol>
        </div>
      </div>
    </AccessibleModal>
  );
}
