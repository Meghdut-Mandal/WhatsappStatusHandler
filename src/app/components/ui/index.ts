// Existing components
export { Button } from './Button';
export { ConnectionStatus } from './ConnectionStatus';
export { ErrorBoundary } from './ErrorBoundary';
export { Loading } from './Loading';
export { QRDisplay } from './QRDisplay';

// Week 2 components
export { FileUpload } from './FileUpload';
export { MediaPreview } from './MediaPreview';
export { UploadProgress } from './UploadProgress';
export { FileManager } from './FileManager';

// Week 3 components
export { StatisticsWidget, ActivityOverview } from './StatisticsWidget';
export { SendHistory } from './SendHistory';
export { 
  SettingsInterface, 
  GeneralSettings, 
  DataManagement, 
  SessionManagement 
} from './SettingsInterface';

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
