'use client';

import { useState } from 'react';
import { FileManager, MediaHistory } from '@/app/components/ui';
import { FileWithPreview } from '@/app/components/ui/FileUpload';

export default function UploadPage() {
  const [sendTarget, setSendTarget] = useState<{
    type: 'status' | 'contact' | 'group';
    identifier?: string;
  }>({ type: 'status' });

  const handleFileSend = async (
    files: FileWithPreview[], 
    targetType: 'status' | 'contact' | 'group', 
    targetId?: string
  ) => {
    try {
      // Get media meta IDs from uploaded files
      const fileIds = files
        .filter(f => f.mediaMetaId)
        .map(f => f.mediaMetaId!);

      if (fileIds.length === 0) {
        alert('Please upload files first before sending');
        return;
      }

      const endpoint = `/api/send/${targetType}`;
      const payload: Record<string, unknown> = {
        files: fileIds,
        caption: 'Sent from WhatsApp Status Handler',
      };

      if (targetType === 'contact') {
        payload.phoneNumber = targetId || prompt('Enter phone number:');
      } else if (targetType === 'group') {
        payload.groupId = targetId || prompt('Enter group ID:');
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        alert(`Successfully sent ${files.length} file(s) to ${targetType}!`);
      } else {
        alert(`Failed to send: ${result.error}`);
      }
    } catch (error) {
      console.error('Send error:', error);
      alert('Failed to send files');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              WhatsApp File Upload & Send
            </h1>
            <p className="text-gray-600">
              Upload files and send them to WhatsApp Status, contacts, or groups without compression. View and reuse previously uploaded media from your history.
            </p>
          </div>

          {/* Send Target Selector */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Send Target
            </h2>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="target"
                  value="status"
                  checked={sendTarget.type === 'status'}
                  onChange={() => setSendTarget({ type: 'status' })}
                  className="mr-2"
                />
                WhatsApp Status
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="target"
                  value="contact"
                  checked={sendTarget.type === 'contact'}
                  onChange={() => setSendTarget({ type: 'contact' })}
                  className="mr-2"
                />
                Contact
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="target"
                  value="group"
                  checked={sendTarget.type === 'group'}
                  onChange={() => setSendTarget({ type: 'group' })}
                  className="mr-2"
                />
                Group
              </label>
            </div>
          </div>

          {/* File Manager */}
          <FileManager 
            onFileSend={(files) => {
              handleFileSend(files, sendTarget.type, sendTarget.identifier);
            }}
          />

          {/* Media History */}
          <div className="mt-8">
            <MediaHistory 
              onFileSelect={(files) => {
                // Convert MediaHistoryFile to FileWithPreview format for sending
                const convertedFiles: Partial<FileWithPreview>[] = files.map(file => ({
                  id: file.id,
                  name: file.originalName,
                  size: file.sizeBytes,
                  type: file.mimetype,
                  lastModified: new Date(file.createdAt).getTime(),
                  uploadStatus: 'completed' as const,
                  mediaMetaId: file.id,
                  preview: file.previewUrl,
                  // Add minimal File-like properties
                  webkitRelativePath: '',
                  arrayBuffer: async () => new ArrayBuffer(0),
                  bytes: async () => new Uint8Array(0),
                  slice: () => new Blob(),
                  stream: () => new ReadableStream(),
                  text: async () => '',
                }));
                handleFileSend(convertedFiles as FileWithPreview[], sendTarget.type, sendTarget.identifier);
              }}
              onFileResend={(file) => {
                // Convert single file to array for sending
                const convertedFile: Partial<FileWithPreview> = {
                  id: file.id,
                  name: file.originalName,
                  size: file.sizeBytes,
                  type: file.mimetype,
                  lastModified: new Date(file.createdAt).getTime(),
                  uploadStatus: 'completed' as const,
                  mediaMetaId: file.id,
                  preview: file.previewUrl,
                  // Add minimal File-like properties
                  webkitRelativePath: '',
                  arrayBuffer: async () => new ArrayBuffer(0),
                  bytes: async () => new Uint8Array(0),
                  slice: () => new Blob(),
                  stream: () => new ReadableStream(),
                  text: async () => '',
                };
                handleFileSend([convertedFile as FileWithPreview], sendTarget.type, sendTarget.identifier);
              }}
              onFileDelete={(fileIds) => {
                // Handle file deletion
                console.log('Deleting files:', fileIds);
                // The MediaHistory component already handles the API call
              }}
              maxHeight="500px"
            />
          </div>

        </div>
      </div>
    </div>
  );
}
