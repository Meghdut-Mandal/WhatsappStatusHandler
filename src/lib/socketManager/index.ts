export { BaileysManager, getBaileysManager } from './BaileysManager';
export { MessageSender } from './MessageSender';
export { ContactManager } from './ContactManager';
export { SendTargetingManager } from './SendTargetingManager';

export type { ConnectionStatus } from './BaileysManager';
export type { 
  SendOptions, 
  SendResult, 
  MessageType 
} from './MessageSender';

export type {
  ContactInfo,
  GroupInfo,
  ContactFilters,
  GroupFilters
} from './ContactManager';

export type {
  SendTarget,
  BroadcastList,
  ScheduledSend,
  SendConfirmation,
  MultiSendOptions,
  MultiSendResult
} from './SendTargetingManager';
