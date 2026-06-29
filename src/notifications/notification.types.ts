import type { ExportPayload, NotificationChannelId } from '../publishing/publishing.types';

export type { NotificationChannelId };

export interface ReminderNotification {
  tenantId: string;
  postId: string;
  export: ExportPayload; // the post, ready, inside the reminder
  remindAt: string; // ISO
}

export interface DeliveryResult {
  delivered: boolean;
  error?: string;
}

export interface NotificationChannel {
  id: NotificationChannelId;
  send(payload: ReminderNotification): Promise<DeliveryResult>;
}

// DI token for the array of registered channels. Adding WhatsappChannel later
// means registering one more provider in this token — no scheduler/route changes.
export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');
