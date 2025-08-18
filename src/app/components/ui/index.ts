// Existing components
export { Button } from './Button';
export { Input } from './Input';
export { Badge } from './Badge';
export { ConnectionStatus } from './ConnectionStatus';
export { ErrorBoundary } from './ErrorBoundary';
export { Loading } from './Loading';
export { QRDisplay } from './QRDisplay';
export { HamburgerMenu } from './HamburgerMenu';
export { PairingCodeDialog } from './PairingCodeDialog';
export { PairingCodeDisplay } from './PairingCodeDisplay';

// Week 2 components
export { FileUpload } from './FileUpload';
export { MediaPreview } from './MediaPreview';
export { UploadProgress } from './UploadProgress';
export { FileManager } from './FileManager';
export { MediaHistory } from './MediaHistory';

// Week 3 components
export { StatisticsWidget, ActivityOverview } from './StatisticsWidget';
export { SendHistory } from './SendHistory';
export { 
  SettingsInterface, 
  GeneralSettings, 
  DataManagement, 
  SessionManagement 
} from './SettingsInterface';

// Sync and notification components
export { ToastProvider, useToast } from './Toast';
export { SyncStatusIndicator } from './SyncStatusIndicator';
export { ContactsErrorBoundary, useErrorHandler } from './ContactsErrorBoundary';

// Types
export type { FileWithPreview } from './FileUpload';
export type { UploadProgressItem } from './UploadProgress';
export type { 
  StatisticItem, 
  ActivityItem 
} from './StatisticsWidget';
export type { 
  SendHistoryItem 
} from './SendHistory';
export type { 
  SettingsSection, 
  GeneralSettingsProps, 
  DataManagementProps, 
  SessionManagementProps, 
  SessionInfo 
} from './SettingsInterface';
export type { Toast } from './Toast';
export type { SyncStatus } from './SyncStatusIndicator';
