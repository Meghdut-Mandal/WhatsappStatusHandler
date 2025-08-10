'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX,
  Maximize2,
  Minimize2,
  SkipBack,
  SkipForward,
  X,
  FileText,
  File,
  Image as ImageIcon,
  Video as VideoIcon,
  Music,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { FileWithPreview } from './FileUpload';

interface MediaPreviewProps {
  file: FileWithPreview;
  className?: string;
  showControls?: boolean;
  onClose?: () => void;
}

interface MediaModalProps {
  file: FileWithPreview;
  isOpen: boolean;
  onClose: () => void;
}

export function MediaPreview({ 
  file, 
  className, 
  showControls = true,
  onClose 
}: MediaPreviewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Early return if file is not provided or missing required properties
  if (!file) {
    return (
      <div className={cn('w-full h-48 bg-gray-100 dark:bg-gray-800 rounded-lg flex flex-col items-center justify-center text-gray-500 dark:text-gray-400', className)}>
        <File className="w-8 h-8" />
        <p className="mt-2 text-sm text-center px-2">No file selected</p>
      </div>
    );
  }

  // Handle case where file.type might be empty or undefined
  const fileType = file.type || '';
  const fileName = file.name || 'Unknown file';
  const fileSize = file.size || 0;

  const handlePreviewClick = () => {
    if (fileType.startsWith('image/') || fileType.startsWith('video/')) {
      setIsModalOpen(true);
    }
  };

  const getFileIcon = () => {
    if (!fileType) return <File className="w-8 h-8" />;
    if (fileType.startsWith('image/')) return <ImageIcon className="w-8 h-8" />;
    if (fileType.startsWith('video/')) return <VideoIcon className="w-8 h-8" />;
    if (fileType.startsWith('audio/')) return <Music className="w-8 h-8" />;
    if (fileType === 'application/pdf') return <FileText className="w-8 h-8" />;
    return <File className="w-8 h-8" />;
  };

  return (
    <>
      <div className={cn('relative group', className)}>
        {fileType.startsWith('image/') && file.preview ? (
          <div 
            className="relative cursor-pointer overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800"
            onClick={handlePreviewClick}
          >
            <img
              src={file.preview}
              alt={fileName}
              className="w-full h-48 object-cover transition-transform group-hover:scale-105"
            />
            {showControls && (
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Eye className="w-8 h-8 text-white" />
              </div>
            )}
          </div>
        ) : fileType.startsWith('video/') && file.preview ? (
          <div 
            className="relative cursor-pointer overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800"
            onClick={handlePreviewClick}
          >
            <video
              src={file.preview}
              className="w-full h-48 object-cover"
              preload="metadata"
            />
            {showControls && (
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Play className="w-8 h-8 text-white" />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-48 bg-gray-100 dark:bg-gray-800 rounded-lg flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            {getFileIcon()}
            <p className="mt-2 text-sm text-center px-2 truncate w-full">{fileName}</p>
            <p className="text-xs text-gray-400">{formatFileSize(fileSize)}</p>
          </div>
        )}

        {showControls && onClose && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Full-screen modal */}
      <MediaModal
        file={file}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

function MediaModal({ file, isOpen, onClose }: MediaModalProps) {
  if (!isOpen || !file) return null;
  
  const fileType = file.type || '';

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="relative w-full h-full max-w-7xl max-h-full">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Content */}
        {fileType.startsWith('image/') ? (
          <ImageViewer file={file} />
        ) : fileType.startsWith('video/') ? (
          <VideoPlayer file={file} />
        ) : null}
      </div>
    </div>
  );
}

function ImageViewer({ file }: { file: FileWithPreview }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.5, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.5, 0.1));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDownload = () => {
    if (file.preview && file.name) {
      const link = document.createElement('a');
      link.href = file.preview;
      link.download = file.name;
      link.click();
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Controls */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button
          onClick={handleZoomIn}
          className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <button
          onClick={handleRotate}
          className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
        >
          <RotateCw className="w-5 h-5" />
        </button>
        <button
          onClick={handleReset}
          className="px-3 py-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors text-sm"
        >
          Reset
        </button>
        <button
          onClick={handleDownload}
          className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
        >
          <Download className="w-5 h-5" />
        </button>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <img
          ref={imageRef}
          src={file.preview}
          alt={file.name || 'Image preview'}
          className={cn(
            'max-w-full max-h-full object-contain transition-transform',
            isDragging ? 'cursor-grabbing' : zoom > 1 ? 'cursor-grab' : 'cursor-default'
          )}
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg) translate(${position.x}px, ${position.y}px)`,
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          draggable={false}
        />
      </div>

      {/* Info */}
      <div className="absolute bottom-4 left-4 bg-black/50 text-white px-3 py-2 rounded-lg">
        <p className="text-sm font-medium">{file.name || 'Unknown file'}</p>
        <p className="text-xs text-gray-300">{formatFileSize(file.size || 0)} • {zoom.toFixed(1)}x</p>
      </div>
    </div>
  );
}

function VideoPlayer({ file }: { file: FileWithPreview }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setDuration(video.duration);

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('ended', () => setIsPlaying(false));

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('ended', () => setIsPlaying(false));
    };
  }, []);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setIsMuted(newVolume === 0);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      if (isMuted) {
        videoRef.current.volume = volume;
        setIsMuted(false);
      } else {
        videoRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const skipTime = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + seconds));
    }
  };

  const showControlsTemporarily = () => {
    setShowControls(true);
            if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
        }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-black flex items-center justify-center"
      onMouseMove={showControlsTemporarily}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={file.preview}
        className="max-w-full max-h-full"
        onClick={togglePlay}
      />

      {/* Controls overlay */}
      {showControls && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/50 flex flex-col justify-between p-4">
          {/* Top controls */}
          <div className="flex justify-between items-start">
            <div className="bg-black/50 text-white px-3 py-2 rounded-lg">
              <p className="text-sm font-medium">{file.name || 'Unknown file'}</p>
              <p className="text-xs text-gray-300">{formatFileSize(file.size || 0)}</p>
            </div>
          </div>

          {/* Center play button */}
          {!isPlaying && (
            <div className="flex-1 flex items-center justify-center">
              <button
                onClick={togglePlay}
                className="p-4 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
              >
                <Play className="w-8 h-8" />
              </button>
            </div>
          )}

          {/* Bottom controls */}
          <div className="space-y-2">
            {/* Progress bar */}
            <div className="flex items-center gap-2 text-white text-sm">
              <span>{formatTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none slider"
              />
              <span>{formatTime(duration)}</span>
            </div>

            {/* Control buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => skipTime(-10)}
                  className="p-2 text-white hover:bg-white/20 rounded"
                >
                  <SkipBack className="w-5 h-5" />
                </button>
                <button
                  onClick={togglePlay}
                  className="p-2 text-white hover:bg-white/20 rounded"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => skipTime(10)}
                  className="p-2 text-white hover:bg-white/20 rounded"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="p-2 text-white hover:bg-white/20 rounded"
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 bg-gray-600 rounded-lg appearance-none slider"
                />
                <button
                  onClick={toggleFullscreen}
                  className="p-2 text-white hover:bg-white/20 rounded"
                >
                  {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  // Handle undefined, null, NaN, or negative values
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  // Ensure i is within bounds
  const sizeIndex = Math.min(i, sizes.length - 1);
  const formattedSize = parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(2));
  
  return `${formattedSize} ${sizes[sizeIndex]}`;
}
